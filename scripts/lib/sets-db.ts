/**
 * Validation and database mapping shared by `sets-push.ts` and `sets-pull.ts`.
 *
 * Kept separate from `sets-file.ts` so that the format module stays free of any
 * Prisma dependency and can be exercised without a database.
 */
import type { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";

// A leaf module of plain constants, so importing it pulls in nothing else.
// Duplicating the numbers here would let them drift away from the app's own
// validation.
import {
  MAX_CHARS_TAGS,
  MAX_DESC,
  MAX_NUM_TAGS,
  MAX_TERM,
  MAX_TITLE,
} from "@studyapp/trpc/server/common/constants";

import {
  SeedFileError,
  type SeedSet,
  type SeedTerm,
  isBlank,
} from "./sets-file";

export const REPO_ROOT = join(__dirname, "..", "..");
export const SEEDS_DIR = join(REPO_ROOT, "seeds", "sets");

/**
 * Language codes are the keys of `json.languages`, not of the file itself. The
 * file's own top level is `{ languages, suggestions }`, so validating against it
 * would accept those two words and reject every real code.
 *
 * Read rather than imported: `@studyapp/core/language` does
 * `import json from "./languages.json"`, which needs `resolveJsonModule`, and
 * the inline ts-node options used to run these scripts do not enable it.
 */
export const loadLanguages = (): Set<string> => {
  const path = join(REPO_ROOT, "packages", "core", "languages.json");
  const parsed = JSON.parse(readFileSync(path, "utf8")) as {
    languages?: Record<string, string>;
  };
  const languages = parsed.languages;
  if (!languages || typeof languages !== "object") {
    throw new Error(`${path}: expected a top-level "languages" object`);
  }
  return new Set(Object.keys(languages));
};

export const VISIBILITIES = ["Private", "Unlisted", "Public"] as const;

export const validate = (
  file: string,
  set: SeedSet,
  languages: Set<string>,
  bodyStart: number,
): void => {
  const fail = (message: string, line: number | null = null) => {
    throw new SeedFileError(file, line, message);
  };

  if (!set.title.trim()) fail("title is empty");
  if (set.title.length > MAX_TITLE)
    fail(
      `title is ${set.title.length} characters, over the ${MAX_TITLE} limit`,
    );
  if (set.description.length > MAX_DESC)
    fail(
      `description is ${set.description.length} characters, over the ${MAX_DESC} limit`,
    );

  // "Class" additionally requires an AllowedClassesOnStudySets row and a
  // Teacher caller, which is outside what a seeding script should fabricate.
  if (!(VISIBILITIES as readonly string[]).includes(set.visibility)) {
    fail(
      `visibility "${set.visibility}" is not one of ${VISIBILITIES.join(
        ", ",
      )}` +
        (set.visibility === "Class"
          ? ` (Class sets must be configured in the app)`
          : ""),
    );
  }

  for (const [key, value] of [
    ["wordLanguage", set.wordLanguage],
    ["definitionLanguage", set.definitionLanguage],
  ] as const) {
    if (!languages.has(value))
      fail(`${key} "${value}" is not a known language code`);
  }

  if (set.tags.length > MAX_NUM_TAGS)
    fail(`${set.tags.length} tags, over the ${MAX_NUM_TAGS} limit`);
  for (const tag of set.tags) {
    if (tag.length > MAX_CHARS_TAGS)
      fail(`tag "${tag}" is over the ${MAX_CHARS_TAGS} character limit`);
  }

  set.terms.forEach((term, index) => {
    const line = bodyStart + index;
    if (term.word.length > MAX_TERM)
      fail(
        `word is ${term.word.length} characters, over the ${MAX_TERM} limit`,
        line,
      );
    if (term.definition.length > MAX_TERM)
      fail(
        `definition is ${term.definition.length} characters, over the ${MAX_TERM} limit`,
        line,
      );
  });

  const seen = new Map<string, number>();
  set.terms.forEach((term, index) => {
    if (!term.id) return;
    const previous = seen.get(term.id);
    if (previous !== undefined) {
      fail(
        `term id ${term.id} appears on lines ${bodyStart + previous} and ${
          bodyStart + index
        }`,
        bodyStart + index,
      );
    }
    seen.set(term.id, index);
  });

  const nonBlank = set.terms.filter((term) => !isBlank(term));
  if (nonBlank.length < 2) {
    fail(
      `${nonBlank.length} non-blank card(s); the app requires at least 2 to publish a set`,
    );
  }
};

export interface DbTerm {
  id: string;
  word: string;
  definition: string;
  rank: number;
  assetUrl: string | null;
  wordRichText: unknown;
  definitionRichText: unknown;
}

export const toSeedTerms = (terms: DbTerm[]): SeedTerm[] =>
  terms.map((term) => ({
    word: term.word,
    definition: term.definition,
    id: term.id,
    ...(term.assetUrl ? { assetUrl: term.assetUrl } : {}),
  }));

export const hasRichText = (term: DbTerm): boolean =>
  term.wordRichText !== null || term.definitionRichText !== null;

/** `tags` is a Json column, so anything could be in there. */
export const readTags = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((tag): tag is string => typeof tag === "string")
    : [];

/**
 * Only needed when creating a set. Updates go through the `id_userId` composite
 * so that a file can never reassign a set to a different owner.
 */
export const resolveOwner = async (
  prisma: PrismaClient,
): Promise<{ id: string; email: string | null }> => {
  const email = process.env.SEED_USER_EMAIL;
  if (email) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, username: true },
    });
    if (!user) throw new Error(`No user with email ${email}`);
    if (!user.username)
      throw new Error(
        `User ${email} has no username; sign in through the app once to complete onboarding`,
      );
    return { id: user.id, email: user.email };
  }

  const users = await prisma.user.findMany({
    select: { id: true, email: true, username: true },
    take: 5,
  });
  if (users.length === 0) throw new Error("No users in the database");
  if (users.length > 1) {
    throw new Error(
      `${users.length} users in the database. Set SEED_USER_EMAIL to choose one: ` +
        users.map((user) => user.email ?? user.id).join(", "),
    );
  }
  const only = users[0]!;
  if (!only.username)
    throw new Error(
      `The only user has no username; sign in through the app once to complete onboarding`,
    );
  return { id: only.id, email: only.email };
};

/** Matches the pretty-URL rewrite in apps/next/next.config.mjs. */
const SET_ID_REGEXP = /c[a-z0-9]{24}/;

export const parseSetRef = (ref: string): string => {
  const match = SET_ID_REGEXP.exec(ref.trim());
  if (!match) {
    throw new Error(
      `"${ref}" does not contain a study set id (expected 25 characters starting with "c")`,
    );
  }
  return match[0];
};
