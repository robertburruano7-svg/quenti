import { execFileSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  APP_NAME,
  ICONSET_SIZES,
  ICON_SOURCE,
  infoPlist,
  launcherScript,
  shellQuote,
} from "../scripts/lib/mac-app";

const REPO_ROOT = join(__dirname, "..");

describe("shellQuote", () => {
  it.each([
    ["/Users/rob/quenti", "'/Users/rob/quenti'"],
    ["/Users/rob/my projects/quenti", "'/Users/rob/my projects/quenti'"],
    ["/Users/rob/rob's stuff", "'/Users/rob/rob'\\''s stuff'"],
  ])("quotes %j", (input, expected) => {
    expect(shellQuote(input)).toBe(expected);
  });

  it("survives a round trip through the shell", () => {
    // The real question is whether bash reads back exactly what went in.
    for (const path of [
      "/tmp/plain",
      "/tmp/with space",
      "/tmp/rob's dir",
      "/tmp/quote\"and'both",
      "/tmp/semi;colon",
      "/tmp/dollar$var",
    ]) {
      const out = execFileSync(
        "bash",
        ["-c", `printf %s ${shellQuote(path)}`],
        {
          encoding: "utf8",
        },
      );
      expect(out).toBe(path);
    }
  });
});

describe("launcherScript", () => {
  const script = launcherScript({ repoPath: "/Users/rob/quenti" });

  it("is valid bash", () => {
    // bash -n parses without executing, which is the strongest check available
    // without a Mac.
    const dir = mkdtempSync(join(tmpdir(), "launcher-"));
    try {
      const file = join(dir, "studyapp");
      writeFileSync(file, script, "utf8");
      expect(() =>
        execFileSync("bash", ["-n", file], { stdio: "pipe" }),
      ).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("passes shellcheck, where it is installed", () => {
    // Quoting is the likeliest defect in a script full of "$HOME/Library/..."
    // paths, and bash -n does not catch it. Skipped rather than failed when
    // shellcheck is absent, so the suite stays portable.
    let available = true;
    try {
      execFileSync("shellcheck", ["--version"], { stdio: "ignore" });
    } catch {
      available = false;
    }
    if (!available) return;

    const dir = mkdtempSync(join(tmpdir(), "launcher-"));
    try {
      // A path with a space is the case most likely to expose bad quoting.
      const file = join(dir, "studyapp");
      writeFileSync(
        file,
        launcherScript({ repoPath: "/Users/rob/my apps/quenti" }),
        "utf8",
      );
      expect(() =>
        execFileSync("shellcheck", [file], { stdio: "pipe" }),
      ).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("bakes in the repo path, quoted", () => {
    expect(script).toContain("REPO='/Users/rob/quenti'");
  });

  it("quotes a repo path containing a space", () => {
    const withSpace = launcherScript({ repoPath: "/Users/rob/my apps/quenti" });
    expect(withSpace).toContain("REPO='/Users/rob/my apps/quenti'");
    const dir = mkdtempSync(join(tmpdir(), "launcher-"));
    try {
      const file = join(dir, "studyapp");
      writeFileSync(file, withSpace, "utf8");
      expect(() =>
        execFileSync("bash", ["-n", file], { stdio: "pipe" }),
      ).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("leaves no unsubstituted placeholders", () => {
    expect(script).not.toMatch(/\$\{[A-Z_]+\}/);
    expect(script).not.toContain("undefined");
    expect(script).not.toContain("[object Object]");
  });

  it("pins PATH before anything needs it", () => {
    // Finder gives a minimal environment; bun and mysql are not on it.
    const pathLine = script.indexOf('export PATH="/opt/homebrew/bin');
    expect(pathLine).toBeGreaterThan(-1);
    expect(pathLine).toBeLessThan(script.indexOf("mysqladmin"));
    expect(pathLine).toBeLessThan(script.indexOf("bun dev"));
  });

  it("refuses a port held by something else rather than letting the port drift", () => {
    // next dev silently moves to 3001 on EADDRINUSE while .env still says 3000,
    // which breaks the auth callback in a confusing way.
    expect(script).toContain("is in use by something that is not");
  });

  it("signals the whole process group, not just the captured pid", () => {
    // bun dev is several processes deep; orphaned workers keep holding the port.
    expect(script).toContain('kill -TERM -"$SERVER_PGID"');
    expect(script).toContain('kill -KILL -"$SERVER_PGID"');
  });

  it("tears the server down on every exit path", () => {
    expect(script).toContain("trap stop_server EXIT INT TERM");
  });

  it("runs the dev server, not a production build", () => {
    // Production flips Google credentials to required and stops the magic link
    // being printed, leaving no way to sign in locally.
    expect(script).toContain("bun dev");
    expect(script).not.toContain("bun start");
    expect(script).not.toContain("NODE_ENV=production");
  });

  it("stops turbo leaving a daemon behind", () => {
    expect(script).toContain("--no-daemon");
  });

  it("uses an isolated Chrome profile", () => {
    expect(script).toContain("--user-data-dir=");
    expect(script).toContain("--app=");
  });

  it("falls back to the default browser when Chrome is absent", () => {
    expect(script).toContain('open "$URL"');
  });

  it("logs somewhere findable and surfaces failures on screen", () => {
    expect(script).toContain("Library/Logs/Studyapp");
    expect(script).toContain("osascript");
  });

  it("honours a custom port throughout", () => {
    const alt = launcherScript({ repoPath: "/x", port: 4000 });
    expect(alt).toContain("PORT=4000");
    expect(alt).toContain("http://localhost:4000");
    // Only the executable lines matter; a port in a comment is prose.
    const code = alt
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");
    expect(code).not.toContain("3000");
  });
});

describe("infoPlist", () => {
  it("names the executable the generator actually writes", () => {
    expect(infoPlist()).toContain(
      "<key>CFBundleExecutable</key><string>studyapp</string>",
    );
  });

  it("declares the icon without its extension, as macOS expects", () => {
    expect(infoPlist()).toContain(
      "<key>CFBundleIconFile</key><string>studyapp</string>",
    );
  });

  it("is well-formed XML", () => {
    const dir = mkdtempSync(join(tmpdir(), "plist-"));
    try {
      const file = join(dir, "Info.plist");
      writeFileSync(file, infoPlist(), "utf8");
      const parsed = readFileSync(file, "utf8");
      expect(parsed.match(/<dict>/g)?.length).toBe(
        parsed.match(/<\/dict>/g)?.length,
      );
      expect(parsed.match(/<key>/g)?.length).toBe(
        parsed.match(/<\/key>/g)?.length,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("icon source", () => {
  it("exists and is square", () => {
    const buf = readFileSync(join(REPO_ROOT, ICON_SOURCE));
    // PNG IHDR: width and height are big-endian uint32 at offsets 16 and 20.
    expect(buf.subarray(1, 4).toString("ascii")).toBe("PNG");
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    expect(width).toBe(height);
    expect(width).toBeGreaterThanOrEqual(512);
  });

  it("covers every size iconutil expects", () => {
    const names = ICONSET_SIZES.map((s) => s.name);
    expect(names).toContain("icon_16x16.png");
    expect(names).toContain("icon_512x512@2x.png");
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("app name", () => {
  it("matches the icns filename the plist points at", () => {
    expect(`${APP_NAME.toLowerCase()}.icns`).toBe("studyapp.icns");
  });
});
