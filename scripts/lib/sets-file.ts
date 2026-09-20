/**
 * Parsing and serialization for seed files in `seeds/sets/*.tsv`.
 *
 * This module is the single definition of the format. Both `sets-push.ts` and
 * `sets-pull.ts` go through it so the two directions can never disagree.
 *
 * A file is a header block of `key: value` lines, a `---` separator, then one
 * card per line as tab-separated `word`, `definition`, `id`, `assetUrl`. The
 * first two columns match the app's paste importer exactly, and that importer
 * drops any further columns, so a file body can be pasted straight into it.
 */
import { createHash } from "crypto";

export const SEP = "---";

export interface SeedTerm {
  word: string;
  definition: string;
  /** Term.id. Absent on a line the user hand-wrote; filled in after insert. */
  id?: string;
  /** Echoed from the database on pull. Never written back by push. */
  assetUrl?: string;
}

export interface SeedSet {
  title: string;
  description: string;
  visibility: string;
  wordLanguage: string;
  definitionLanguage: string;
  tags: string[];
  /** StudySet.id. Absent until the set has been created. */
  id?: string;
  /** Checksum of the body as of the last successful sync. */
  checksum?: string;
  terms: SeedTerm[];
}

/**
 * Field values are escaped so a card containing a tab or newline round-trips
 * losslessly. The common case contains neither, so bodies stay pasteable.
 */
export const escapeField = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/\t/g, "\\t").replace(/\r?\n/g, "\\n");

export const unescapeField = (value: string): string => {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = value[i + 1];
    if (next === "t") {
      out += "\t";
      i++;
    } else if (next === "n") {
      out += "\n";
      i++;
    } else if (next === "\\") {
      out += "\\";
      i++;
    } else {
      // A lone backslash is kept as-is rather than swallowed, so that hand
      // written content is never silently altered.
      out += "\\";
    }
  }
  return out;
};

export class SeedFileError extends Error {
  constructor(
    readonly file: string,
    readonly line: number | null,
    message: string,
  ) {
    super(
      line === null ? `${file}: ${message}` : `${file}:${line}: ${message}`,
    );
    this.name = "SeedFileError";
  }
}

/**
 * The body is what the checksum covers, and what push compares against the
 * database. Building it from a SeedSet and from a database row must produce
 * identical bytes, which is what makes `pull` after `push` a no-op.
 */
export const serializeBody = (terms: SeedTerm[]): string =>
  terms
    .map((term) => {
      const columns = [escapeField(term.word), escapeField(term.definition)];
      // Only emit trailing columns when they carry something, so a set with no
      // assets does not gain a column of empty fields.
      if (term.id || term.assetUrl) columns.push(term.id ?? "");
      if (term.assetUrl) columns.push(escapeField(term.assetUrl));
      return columns.join("\t");
    })
    .join("\n");

export const checksumOf = (body: string): string =>
  createHash("sha256").update(body, "utf8").digest("hex");

export const serialize = (set: SeedSet): string => {
  const body = serializeBody(set.terms);
  const header: string[] = [
    `title: ${escapeField(set.title)}`,
    `description: ${escapeField(set.description)}`,
    `visibility: ${set.visibility}`,
    `wordLanguage: ${set.wordLanguage}`,
    `definitionLanguage: ${set.definitionLanguage}`,
    `tags: ${set.tags.map(escapeField).join(", ")}`,
  ];
  if (set.id) header.push(`id: ${set.id}`);
  header.push(`checksum: ${checksumOf(body)}`);

  return `${header.join("\n")}\n${SEP}\n${body}\n`;
};

const HEADER_KEYS = [
  "title",
  "description",
  "visibility",
  "wordLanguage",
  "definitionLanguage",
  "tags",
  "id",
  "checksum",
] as const;

type HeaderKey = (typeof HEADER_KEYS)[number];

const isHeaderKey = (key: string): key is HeaderKey =>
  (HEADER_KEYS as readonly string[]).includes(key);

export interface ParsedSeedFile {
  set: SeedSet;
  /** The body exactly as read, for comparison against `checksum`. */
  body: string;
  /** 1-indexed line of the first card, so errors can point at real lines. */
  bodyStartLine: number;
}

export const parse = (file: string, contents: string): ParsedSeedFile => {
  // CRLF would otherwise show up inside the last column of every line and make
  // every card look changed.
  const normalized = contents.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  const sepIndex = lines.indexOf(SEP);
  if (sepIndex === -1) {
    throw new SeedFileError(file, null, `missing "${SEP}" separator line`);
  }

  const header: Partial<Record<HeaderKey, string>> = {};
  for (let i = 0; i < sepIndex; i++) {
    const raw = lines[i] ?? "";
    if (!raw.trim()) continue;
    const colon = raw.indexOf(":");
    if (colon === -1) {
      throw new SeedFileError(file, i + 1, `header line is not "key: value"`);
    }
    const key = raw.slice(0, colon).trim();
    if (!isHeaderKey(key)) {
      throw new SeedFileError(
        file,
        i + 1,
        `unknown header key "${key}" (expected one of ${HEADER_KEYS.join(
          ", ",
        )})`,
      );
    }
    if (header[key] !== undefined) {
      throw new SeedFileError(file, i + 1, `duplicate header key "${key}"`);
    }
    header[key] = unescapeField(raw.slice(colon + 1).replace(/^ /, ""));
  }

  if (header.title === undefined) {
    throw new SeedFileError(file, null, `missing required header "title"`);
  }

  // A trailing newline is conventional but not part of the body.
  const bodyLines = lines.slice(sepIndex + 1);
  while (bodyLines.length && bodyLines[bodyLines.length - 1] === "") {
    bodyLines.pop();
  }

  const terms: SeedTerm[] = bodyLines.map((line, index) => {
    const columns = line.split("\t");
    const id = (columns[2] ?? "").trim();
    const assetUrl = columns[3] ?? "";
    if (columns.length > 4) {
      throw new SeedFileError(
        file,
        sepIndex + 2 + index,
        `expected at most 4 tab-separated columns, found ${columns.length}`,
      );
    }
    return {
      word: unescapeField(columns[0] ?? ""),
      definition: unescapeField(columns[1] ?? ""),
      ...(id ? { id } : {}),
      ...(assetUrl ? { assetUrl: unescapeField(assetUrl) } : {}),
    };
  });

  const set: SeedSet = {
    title: header.title,
    description: header.description ?? "",
    visibility: header.visibility ?? "Private",
    wordLanguage: header.wordLanguage ?? "en",
    definitionLanguage: header.definitionLanguage ?? "en",
    tags: (header.tags ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    ...(header.id ? { id: header.id } : {}),
    ...(header.checksum ? { checksum: header.checksum } : {}),
    terms,
  };

  return { set, body: bodyLines.join("\n"), bodyStartLine: sepIndex + 2 };
};

/** The app treats a card as blank only when both sides are empty. */
export const isBlank = (term: SeedTerm): boolean =>
  !term.word.trim() && !term.definition.trim();

export const slugify = (title: string): string =>
  title
    // Decompose accents and drop the combining marks, so "Ünïcode" becomes
    // "unicode" rather than turning each accented letter into a separator.
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "set";
