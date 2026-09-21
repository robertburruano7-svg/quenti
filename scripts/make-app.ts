/**
 * Builds Studyapp.app, a double-clickable launcher for the local dev server.
 *
 *   bun run make:app
 *
 * Run once, and again if the repo moves: the launcher has the project path
 * baked in, because an app launched from Finder starts in "/".
 *
 * The icon is converted with macOS's own `sips` and `iconutil` rather than
 * shipping a prebuilt .icns, so nothing binary is committed that cannot be
 * regenerated from the PNG already in the repo.
 */
import { execFileSync } from "child_process";
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

import {
  APP_NAME,
  ICONSET_SIZES,
  ICON_SOURCE,
  infoPlist,
  launcherScript,
} from "./lib/mac-app";

const REPO_ROOT = join(__dirname, "..");
const APP_PATH = join(REPO_ROOT, `${APP_NAME}.app`);
const CONTENTS = join(APP_PATH, "Contents");

const buildIcon = (resourcesDir: string) => {
  const source = join(REPO_ROOT, ICON_SOURCE);
  if (!existsSync(source)) {
    throw new Error(`Missing icon source: ${ICON_SOURCE}`);
  }

  const iconset = join(REPO_ROOT, `${APP_NAME}.iconset`);
  rmSync(iconset, { recursive: true, force: true });
  mkdirSync(iconset, { recursive: true });

  for (const { name, px } of ICONSET_SIZES) {
    execFileSync(
      "sips",
      ["-z", String(px), String(px), source, "--out", join(iconset, name)],
      { stdio: "ignore" },
    );
  }

  execFileSync(
    "iconutil",
    [
      "-c",
      "icns",
      iconset,
      "-o",
      join(resourcesDir, `${APP_NAME.toLowerCase()}.icns`),
    ],
    { stdio: "inherit" },
  );
  rmSync(iconset, { recursive: true, force: true });
};

const main = () => {
  if (process.platform !== "darwin") {
    console.error(
      `This builds a macOS .app bundle and needs sips and iconutil, so it only runs on a Mac. Detected: ${process.platform}`,
    );
    process.exitCode = 1;
    return;
  }

  const macOsDir = join(CONTENTS, "MacOS");
  const resourcesDir = join(CONTENTS, "Resources");

  rmSync(APP_PATH, { recursive: true, force: true });
  mkdirSync(macOsDir, { recursive: true });
  mkdirSync(resourcesDir, { recursive: true });

  writeFileSync(join(CONTENTS, "Info.plist"), infoPlist(), "utf8");

  const launcher = join(macOsDir, "studyapp");
  writeFileSync(launcher, launcherScript({ repoPath: REPO_ROOT }), "utf8");
  chmodSync(launcher, 0o755);

  buildIcon(resourcesDir);

  console.log(`Built ${APP_PATH}`);
  console.log(``);
  console.log(`Drag it to /Applications or your Dock, then double-click.`);
  console.log(`Logs: ~/Library/Logs/${APP_NAME}/launcher.log`);
  console.log(``);
  console.log(
    `The project path is baked in. Re-run this if you move the repo.`,
  );
};

main();
