/**
 * Writes a local `.env` from `.env.example`, with secrets generated.
 *
 *   bun run setup:local
 *
 * Deliberately does not touch MySQL or run migrations: creating the database
 * and pushing the schema are separate, visible steps, and this script stays
 * something that can be reasoned about without a running server.
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import { LOCAL_DATABASE_URL, buildLocalEnv } from "./lib/setup-env";

const REPO_ROOT = join(__dirname, "..");
const ENV_PATH = join(REPO_ROOT, ".env");
const EXAMPLE_PATH = join(REPO_ROOT, ".env.example");

const main = () => {
  if (existsSync(ENV_PATH)) {
    // Overwriting would regenerate the encryption key, which invalidates every
    // signed asset URL already in the database.
    console.error(
      `.env already exists. Delete it first if you really want fresh secrets.`,
    );
    process.exitCode = 1;
    return;
  }

  if (!existsSync(EXAMPLE_PATH)) {
    throw new Error(`Missing ${EXAMPLE_PATH}`);
  }

  writeFileSync(
    ENV_PATH,
    buildLocalEnv(readFileSync(EXAMPLE_PATH, "utf8")),
    "utf8",
  );

  console.log(`Wrote .env with generated secrets.`);
  console.log(`  DATABASE_URL = ${LOCAL_DATABASE_URL}`);
  console.log(``);
  console.log(`Next, if you have not already:`);
  console.log(`  brew services start mysql`);
  console.log(`  mysql -u root -e "CREATE DATABASE IF NOT EXISTS studyapp"`);
  console.log(`  bun db:push`);
  console.log(`  bun dev`);
};

main();
