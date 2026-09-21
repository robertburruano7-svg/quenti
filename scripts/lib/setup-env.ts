/**
 * Builds the contents of a local `.env` from `.env.example`.
 *
 * Kept separate from `setup-local.ts` so the interesting part is a pure
 * string-to-string function that can be tested without touching the filesystem.
 */
import { randomBytes } from "crypto";

/** Homebrew MySQL runs as root with no password. */
export const LOCAL_DATABASE_URL = "mysql://root@127.0.0.1:3306/studyapp";

/**
 * `packages/env/server/server.mjs` validates this with `z.string().length(32)`,
 * so it must be exactly 32 characters. 24 random bytes base64-encode to exactly
 * that, with no padding.
 */
export const generateEncryptionKey = (): string =>
  randomBytes(24).toString("base64");

export const generateSecret = (): string => randomBytes(32).toString("base64");

export interface EnvOverrides {
  [key: string]: string;
}

/**
 * Rewrites `KEY=` lines in place, preserving comments, blank lines and ordering
 * so the generated file still reads like the example it came from.
 *
 * Keys not already present in the example are appended, so a caller cannot
 * silently set a variable that the file never mentions.
 */
export const applyEnvOverrides = (
  example: string,
  overrides: EnvOverrides,
): string => {
  const remaining = new Map(Object.entries(overrides));

  const lines = example.replace(/\r\n/g, "\n").split("\n");
  const rewritten = lines.map((line) => {
    const match = /^([A-Z0-9_]+)=/.exec(line);
    if (!match) return line;
    const key = match[1]!;
    if (!remaining.has(key)) return line;
    const value = remaining.get(key)!;
    remaining.delete(key);
    return `${key}=${value}`;
  });

  if (remaining.size) {
    rewritten.push("");
    for (const [key, value] of remaining) rewritten.push(`${key}=${value}`);
  }

  return rewritten.join("\n");
};

export const buildLocalEnv = (example: string): string =>
  applyEnvOverrides(example, {
    DATABASE_URL: LOCAL_DATABASE_URL,
    NEXTAUTH_SECRET: generateSecret(),
    STUDYAPP_ENCRYPTION_KEY: generateEncryptionKey(),
  });
