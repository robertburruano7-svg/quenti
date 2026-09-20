/**
 * Writes database state back into `seeds/sets/*.tsv`.
 *
 *   bun run sets:pull [--set <id or url>] [file ...]
 *
 * Only sets that are already tracked by a file are pulled. `--set` adopts one,
 * creating a file named from the set's title. This is deliberately not a full
 * library backup: the repo tracks what you chose to track.
 *
 * Running this immediately after `sets:push` must produce no git diff. That
 * property is the strongest check that both directions agree on the format.
 */
import { PrismaClient } from "@prisma/client";
import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "fs";
import { basename, join } from "path";

import {
  type DbTerm,
  SEEDS_DIR,
  hasRichText,
  parseSetRef,
  readTags,
  toSeedTerms,
} from "./lib/sets-db";
import {
  type SeedSet,
  checksumOf,
  parse,
  serialize,
  slugify,
} from "./lib/sets-file";

const prisma = new PrismaClient();

const SET_SELECT = {
  id: true,
  title: true,
  description: true,
  visibility: true,
  wordLanguage: true,
  definitionLanguage: true,
  tags: true,
  terms: {
    // Matches the app's own read queries. Without the ephemeral filter, an open
    // editor's placeholder rows would leak into the file.
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
} as const;

const atomicWrite = (path: string, contents: string) => {
  const temp = `${path}.tmp-${process.pid}`;
  writeFileSync(temp, contents, "utf8");
  renameSync(temp, path);
};

interface Target {
  file: string;
  setId: string;
  /** The body as currently on disk, for the drift warning. */
  existingBody?: string;
  existingChecksum?: string;
}

const toSeedSet = (set: {
  id: string;
  title: string;
  description: string;
  visibility: string;
  wordLanguage: string;
  definitionLanguage: string;
  tags: unknown;
  terms: DbTerm[];
}): SeedSet => ({
  title: set.title,
  description: set.description,
  visibility: set.visibility,
  wordLanguage: set.wordLanguage,
  definitionLanguage: set.definitionLanguage,
  tags: readTags(set.tags),
  id: set.id,
  terms: toSeedTerms(set.terms),
});

const writeSet = (target: Target, set: SeedSet, terms: DbTerm[]) => {
  const contents = serialize(set);

  // The checksum recorded in the file describes the database as of the last
  // sync. If the body on disk no longer matches it, there are uncommitted edits
  // here that this write is about to discard.
  if (
    target.existingBody !== undefined &&
    target.existingChecksum !== undefined &&
    checksumOf(target.existingBody) !== target.existingChecksum
  ) {
    console.warn(
      `  ! ${basename(
        target.file,
      )} has local edits that were never pushed; overwriting them`,
    );
  }

  const withAssets = terms.filter((term) => term.assetUrl);
  for (const term of withAssets) {
    console.warn(
      `  ! "${term.word}" has an image, which push will not write back`,
    );
  }
  const withRichText = terms.filter(hasRichText);
  for (const term of withRichText) {
    console.warn(
      `  ! "${term.word}" has formatting, which this file does not capture`,
    );
  }

  atomicWrite(target.file, contents);
};

const main = async () => {
  const argv = process.argv.slice(2);
  const refs: string[] = [];
  const files: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--set") {
      const value = argv[++i];
      if (!value) throw new Error("--set needs an id or url");
      refs.push(value);
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown flag ${arg}`);
    } else {
      files.push(arg);
    }
  }

  const targets: Target[] = [];

  const tracked = files.length
    ? files
    : readdirSync(SEEDS_DIR)
        .filter((name) => name.endsWith(".tsv"))
        .map((name) => join(SEEDS_DIR, name));

  for (const file of tracked) {
    const { set, body } = parse(basename(file), readFileSync(file, "utf8"));
    if (!set.id) {
      console.warn(
        `  ! ${basename(
          file,
        )} has no id yet; push it first so it has something to pull from`,
      );
      continue;
    }
    targets.push({
      file,
      setId: set.id,
      existingBody: body,
      ...(set.checksum ? { existingChecksum: set.checksum } : {}),
    });
  }

  for (const ref of refs) {
    const setId = parseSetRef(ref);
    if (targets.some((target) => target.setId === setId)) continue;

    const set = await prisma.studySet.findFirst({
      where: { id: setId, created: true },
      select: { title: true },
    });
    if (!set) throw new Error(`No published study set with id ${setId}`);

    const file = join(SEEDS_DIR, `${slugify(set.title)}.tsv`);
    if (existsSync(file)) {
      // Refuse rather than clobber a file that belongs to a different set.
      const existing = parse(basename(file), readFileSync(file, "utf8"));
      if (existing.set.id !== setId) {
        throw new Error(
          `${basename(file)} already tracks set ${existing.set.id}. ` +
            `Rename it, or rename the set, before adopting ${setId}.`,
        );
      }
    }
    targets.push({ file, setId });
  }

  if (!targets.length) {
    console.log(
      `Nothing to pull. Adopt a set with: bun run sets:pull --set <id>`,
    );
    return;
  }

  let failed = 0;
  for (const target of targets) {
    const set = await prisma.studySet.findFirst({
      where: { id: target.setId, created: true },
      select: SET_SELECT,
    });
    if (!set) {
      console.error(
        `${basename(target.file)}: set ${
          target.setId
        } is not in the database, or is still a draft`,
      );
      failed++;
      continue;
    }
    console.log(`${basename(target.file)}:`);
    const terms = set.terms as DbTerm[];
    writeSet(target, toSeedSet({ ...set, terms }), terms);
    console.log(`  wrote ${terms.length} card(s)`);
  }

  if (failed) process.exitCode = 1;
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
