/**
 * Applies `seeds/sets/*.tsv` to the database.
 *
 *   bun run sets:push [--dry-run] [--force] [--allow-deletes]
 *                     [--recreate-missing] [--recreate] [file ...]
 *
 * Every run computes a complete plan before writing anything. `--dry-run`
 * prints that plan instead of executing it, so what you inspect is exactly what
 * would run, rather than a transaction that gets rolled back.
 *
 * Cards are matched to database rows by the id in the third column, never by
 * position. Position is an output: rank is assigned from line order. Matching by
 * position would reassign study progress to the wrong cards after any reorder in
 * the app.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { readFileSync, readdirSync, renameSync, writeFileSync } from "fs";
import { basename, join } from "path";

import {
  type DbTerm,
  SEEDS_DIR,
  loadLanguages,
  readTags,
  resolveOwner,
  validate,
} from "./lib/sets-db";
import {
  SeedFileError,
  type SeedSet,
  type SeedTerm,
  checksumOf,
  parse,
  serialize,
  serializeBody,
} from "./lib/sets-file";

const prisma = new PrismaClient();

const CHUNK = 1000;

interface Flags {
  dryRun: boolean;
  force: boolean;
  allowDeletes: boolean;
  recreateMissing: boolean;
  recreate: boolean;
  files: string[];
}

const parseFlags = (argv: string[]): Flags => {
  const flags: Flags = {
    dryRun: false,
    force: false,
    allowDeletes: false,
    recreateMissing: false,
    recreate: false,
    files: [],
  };
  for (const arg of argv) {
    if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--force") flags.force = true;
    else if (arg === "--allow-deletes") flags.allowDeletes = true;
    else if (arg === "--recreate-missing") flags.recreateMissing = true;
    else if (arg === "--recreate") flags.recreate = true;
    else if (arg.startsWith("--")) throw new Error(`Unknown flag ${arg}`);
    else flags.files.push(arg);
  }
  return flags;
};

class PushError extends Error {}

interface TermUpdate {
  id: string;
  rank: number;
  word: string;
  definition: string;
  textChanged: boolean;
  rankChanged: boolean;
}

interface Plan {
  file: string;
  set: SeedSet;
  /** Absent for a set that does not exist yet. */
  setId?: string;
  scalarsChanged: boolean;
  creates: { word: string; definition: string; rank: number }[];
  updates: TermUpdate[];
  deletes: {
    id: string;
    word: string;
    assetUrl: string | null;
    progress: number;
  }[];
  /** Human-readable notes printed for both dry runs and real runs. */
  warnings: string[];
}

const atomicWrite = (path: string, contents: string) => {
  // Same directory, so the rename stays on one filesystem and is atomic.
  const temp = `${path}.tmp-${process.pid}`;
  writeFileSync(temp, contents, "utf8");
  renameSync(temp, path);
};

const buildPlan = async (file: string, flags: Flags): Promise<Plan | null> => {
  const { set, bodyStartLine } = parse(
    basename(file),
    readFileSync(file, "utf8"),
  );
  validate(basename(file), set, languages, bodyStartLine);

  const warnings: string[] = [];

  if (!set.id) {
    return {
      file,
      set,
      scalarsChanged: true,
      creates: set.terms.map((term, rank) => ({
        word: term.word,
        definition: term.definition,
        rank,
      })),
      updates: [],
      deletes: [],
      warnings,
    };
  }

  const existing = await prisma.studySet.findUnique({
    where: { id: set.id },
    select: {
      id: true,
      title: true,
      description: true,
      visibility: true,
      wordLanguage: true,
      definitionLanguage: true,
      tags: true,
      userId: true,
      terms: {
        where: { ephemeral: false },
        orderBy: { rank: "asc" },
        select: {
          id: true,
          word: true,
          definition: true,
          rank: true,
          assetUrl: true,
          wordRichText: true,
          definitionRichText: true,
        },
      },
    },
  });

  if (!existing) {
    if (!flags.recreate) {
      throw new PushError(
        `set ${set.id} no longer exists in the database. It was probably deleted in ` +
          `the app. Re-run with --recreate to insert it as a new set, or delete this file.`,
      );
    }
    warnings.push(`set ${set.id} was missing; recreating it with a new id`);
    const { id: _dropped, ...rest } = set;
    return {
      file,
      set: {
        ...rest,
        terms: set.terms.map(({ id: _termId, ...term }) => term),
      },
      scalarsChanged: true,
      creates: set.terms.map((term, rank) => ({
        word: term.word,
        definition: term.definition,
        rank,
      })),
      updates: [],
      deletes: [],
      warnings,
    };
  }

  const dbTerms = existing.terms as DbTerm[];

  // Drift check. The stored checksum describes the database as of the last
  // successful sync; if the database no longer matches, the app changed the set
  // and pushing would discard that work.
  const dbBody = serializeBody(
    dbTerms.map((term) => ({
      word: term.word,
      definition: term.definition,
      id: term.id,
      ...(term.assetUrl ? { assetUrl: term.assetUrl } : {}),
    })),
  );
  if (set.checksum && checksumOf(dbBody) !== set.checksum) {
    if (!flags.force) {
      throw new PushError(
        `the set changed in the app since this file was last synced. Run ` +
          `"bun run sets:pull" to bring those changes into the file, or re-run ` +
          `with --force to overwrite them.`,
      );
    }
    warnings.push("overwriting app-side changes because --force was given");
  } else if (!set.checksum) {
    warnings.push("no checksum in file; skipping the drift check");
  }

  const byId = new Map(dbTerms.map((term) => [term.id, term]));
  const creates: Plan["creates"] = [];
  const updates: TermUpdate[] = [];
  const keptIds = new Set<string>();

  set.terms.forEach((term, rank) => {
    if (!term.id) {
      creates.push({ word: term.word, definition: term.definition, rank });
      return;
    }
    const match = byId.get(term.id);
    if (!match) {
      if (!flags.recreateMissing) {
        throw new PushError(
          `card id ${term.id} is not in the database. Re-run with ` +
            `--recreate-missing to insert it as a new card, or remove the id from that line.`,
        );
      }
      warnings.push(
        `card id ${term.id} was missing; inserting it as a new card`,
      );
      creates.push({ word: term.word, definition: term.definition, rank });
      return;
    }
    keptIds.add(term.id);
    const textChanged =
      match.word !== term.word || match.definition !== term.definition;
    if (textChanged || match.rank !== rank) {
      updates.push({
        id: term.id,
        rank,
        word: term.word,
        definition: term.definition,
        textChanged,
        rankChanged: match.rank !== rank,
      });
    }
  });

  const deletes: Plan["deletes"] = [];
  for (const term of dbTerms) {
    if (keptIds.has(term.id)) continue;
    const progress =
      (await prisma.studiableTerm.count({ where: { termId: term.id } })) +
      (await prisma.starredTerm.count({ where: { termId: term.id } }));
    deletes.push({
      id: term.id,
      word: term.word,
      assetUrl: term.assetUrl,
      progress,
    });
  }

  const risky = deletes.filter((term) => term.progress > 0 || term.assetUrl);
  if (risky.length && !flags.allowDeletes) {
    throw new PushError(
      `${risky.length} card(s) would be deleted but carry study progress or an ` +
        `image:\n` +
        risky
          .map(
            (term) =>
              `    "${term.word}"` +
              (term.progress ? ` (${term.progress} progress row(s))` : "") +
              (term.assetUrl ? ` (has an image)` : ""),
          )
          .join("\n") +
        `\n  Re-run with --allow-deletes to remove them.`,
    );
  }

  for (const term of updates) {
    if (!term.textChanged) continue;
    const match = byId.get(term.id);
    if (
      match &&
      (match.wordRichText !== null || match.definitionRichText !== null)
    ) {
      warnings.push(
        `formatting on "${match.word}" will be cleared because its text changed`,
      );
    }
  }

  const scalarsChanged =
    existing.title !== set.title ||
    existing.description !== set.description ||
    existing.visibility !== set.visibility ||
    existing.wordLanguage !== set.wordLanguage ||
    existing.definitionLanguage !== set.definitionLanguage ||
    JSON.stringify(readTags(existing.tags)) !== JSON.stringify(set.tags);

  return {
    file,
    set,
    setId: existing.id,
    scalarsChanged,
    creates,
    updates,
    deletes,
    warnings,
  };
};

const describe = (plan: Plan): string => {
  const lines: string[] = [];
  for (const warning of plan.warnings) lines.push(`  ! ${warning}`);
  if (!plan.setId) {
    lines.push(
      `  + create set "${plan.set.title}" with ${plan.creates.length} card(s)`,
    );
    return lines.join("\n");
  }
  if (plan.scalarsChanged) lines.push(`  ~ update set details`);
  for (const term of plan.creates) lines.push(`  + add card "${term.word}"`);
  for (const term of plan.updates) {
    if (term.textChanged) lines.push(`  ~ edit card "${term.word}"`);
    else
      lines.push(`  ~ move card "${term.word}" to position ${term.rank + 1}`);
  }
  for (const term of plan.deletes) {
    lines.push(
      `  - delete card "${term.word}"` +
        (term.progress ? ` (discards ${term.progress} progress row(s))` : "") +
        (term.assetUrl ? ` (orphans an image)` : ""),
    );
  }
  if (!lines.length) lines.push("  no changes");
  return lines.join("\n");
};

const execute = async (plan: Plan, ownerId: string): Promise<void> => {
  const termsChanged =
    plan.creates.length > 0 ||
    plan.updates.length > 0 ||
    plan.deletes.length > 0;

  if (!plan.setId) {
    const created = await prisma.studySet.create({
      data: {
        userId: ownerId,
        // The schema default is true, but the app's draft creator overrides it
        // to false, so a set inserted without this would be treated as a draft.
        created: true,
        createdAt: new Date(),
        title: plan.set.title,
        description: plan.set.description,
        tags: plan.set.tags,
        visibility: plan.set
          .visibility as Prisma.StudySetCreateInput["visibility"],
        wordLanguage: plan.set.wordLanguage,
        definitionLanguage: plan.set.definitionLanguage,
        type: "Default",
        // Learn and Test regenerate distractors lazily whenever this is true.
        cortexStale: true,
        terms: {
          createMany: {
            data: plan.creates.map((term) => ({
              word: term.word,
              definition: term.definition,
              rank: term.rank,
            })),
          },
        },
      },
      select: { id: true },
    });

    const inserted = await prisma.term.findMany({
      where: { studySetId: created.id, ephemeral: false },
      orderBy: { rank: "asc" },
      select: { id: true, word: true, definition: true, assetUrl: true },
    });
    writeBack(plan, created.id, inserted);
    return;
  }

  const operations: Prisma.PrismaPromise<unknown>[] = [];

  for (const term of plan.updates) {
    operations.push(
      prisma.term.update({
        where: { id_studySetId: { id: term.id, studySetId: plan.setId } },
        data: {
          word: term.word,
          definition: term.definition,
          rank: term.rank,
          // Formatting no longer corresponds to text that changed. DbNull
          // clears the column; a plain null is rejected by the generated type.
          ...(term.textChanged
            ? { wordRichText: Prisma.DbNull, definitionRichText: Prisma.DbNull }
            : {}),
        },
      }),
    );
  }

  for (let i = 0; i < plan.creates.length; i += CHUNK) {
    const chunk = plan.creates.slice(i, i + CHUNK);
    operations.push(
      prisma.term.createMany({
        data: chunk.map((term) => ({
          studySetId: plan.setId!,
          word: term.word,
          definition: term.definition,
          rank: term.rank,
        })),
      }),
    );
  }

  if (plan.deletes.length) {
    // Prisma Client, never raw SQL: cascades to StarredTerm, StudiableTerm and
    // Distractor are emulated client-side under relationMode = "prisma", and
    // Distractor has no database-level foreign key to fall back on.
    operations.push(
      prisma.term.deleteMany({
        where: { id: { in: plan.deletes.map((term) => term.id) } },
      }),
    );
  }

  if (plan.scalarsChanged || termsChanged) {
    operations.push(
      prisma.studySet.update({
        // The composite makes it impossible for a file to reassign ownership.
        where: { id_userId: { id: plan.setId, userId: ownerId } },
        data: {
          ...(plan.scalarsChanged
            ? {
                title: plan.set.title,
                description: plan.set.description,
                tags: plan.set.tags,
                visibility: plan.set
                  .visibility as Prisma.StudySetUpdateInput["visibility"],
                wordLanguage: plan.set.wordLanguage,
                definitionLanguage: plan.set.definitionLanguage,
              }
            : {}),
          // Must land in the same transaction as the term changes, or a crash
          // between them leaves stale distractors marked fresh.
          ...(termsChanged ? { cortexStale: true } : {}),
        },
      }),
    );
  }

  if (operations.length) await prisma.$transaction(operations);

  const after = await prisma.term.findMany({
    where: { studySetId: plan.setId, ephemeral: false },
    orderBy: { rank: "asc" },
    select: { id: true, word: true, definition: true, assetUrl: true },
  });
  writeBack(plan, plan.setId, after);
};

const writeBack = (
  plan: Plan,
  setId: string,
  terms: {
    id: string;
    word: string;
    definition: string;
    assetUrl: string | null;
  }[],
) => {
  const next: SeedSet = {
    ...plan.set,
    id: setId,
    terms: terms.map(
      (term): SeedTerm => ({
        word: term.word,
        definition: term.definition,
        id: term.id,
        ...(term.assetUrl ? { assetUrl: term.assetUrl } : {}),
      }),
    ),
  };
  atomicWrite(plan.file, serialize(next));
};

let languages: Set<string>;

const main = async () => {
  const flags = parseFlags(process.argv.slice(2));
  languages = loadLanguages();

  const files = flags.files.length
    ? flags.files
    : readdirSync(SEEDS_DIR)
        .filter((name) => name.endsWith(".tsv"))
        .map((name) => join(SEEDS_DIR, name));

  if (!files.length) {
    console.log(`No .tsv files in ${SEEDS_DIR}`);
    return;
  }

  // Build every plan before writing anything, so a duplicate id or a validation
  // error in the last file cannot leave the first half applied.
  const plans: Plan[] = [];
  const failures: string[] = [];
  const seenSetIds = new Map<string, string>();

  for (const file of files) {
    try {
      const plan = await buildPlan(file, flags);
      if (!plan) continue;
      if (plan.set.id) {
        const previous = seenSetIds.get(plan.set.id);
        if (previous) {
          throw new PushError(
            `set id ${plan.set.id} is also used by ${basename(previous)}`,
          );
        }
        seenSetIds.set(plan.set.id, file);
      }
      plans.push(plan);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // SeedFileError already carries the file name and line.
      failures.push(
        error instanceof SeedFileError
          ? message
          : `${basename(file)}: ${message}`,
      );
    }
  }

  for (const plan of plans) {
    console.log(`${basename(plan.file)}:`);
    console.log(describe(plan));
  }

  if (failures.length) {
    console.error(`\n${failures.length} file(s) could not be processed:`);
    for (const failure of failures) console.error(`  ${failure}`);
  }

  if (flags.dryRun) {
    console.log(
      `\nDry run: nothing was written.` +
        (plans.some((plan) => !plan.setId)
          ? ` New sets have no id yet, so nothing downstream of their creation was checked.`
          : ""),
    );
    if (failures.length) process.exitCode = 1;
    return;
  }

  if (failures.length) {
    console.error(`\nRefusing to write while any file is in error.`);
    process.exitCode = 1;
    return;
  }

  // Needed for the id_userId composite on updates, and for the orphan report.
  const owner = await resolveOwner(prisma);

  for (const plan of plans) {
    await execute(plan, owner.id);
    console.log(`${basename(plan.file)}: applied`);
  }

  // Sets in the database with no tracked file. A missing file is weak evidence
  // of intent, so this reports rather than deletes.
  const tracked = new Set(
    plans.map((plan) => plan.setId).filter((id): id is string => Boolean(id)),
  );
  const untracked = await prisma.studySet.findMany({
    where: { userId: owner.id, created: true, id: { notIn: [...tracked] } },
    select: { id: true, title: true },
  });
  if (untracked.length) {
    console.log(
      `\n${untracked.length} set(s) in the database with no seed file:`,
    );
    for (const set of untracked) console.log(`  ${set.id}  ${set.title}`);
    console.log(`  Track one with: bun run sets:pull --set <id>`);
  }
};

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
