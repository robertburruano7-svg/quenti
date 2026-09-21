import {
  LOCAL_DATABASE_URL,
  applyEnvOverrides,
  buildLocalEnv,
  generateEncryptionKey,
  generateSecret,
} from "../scripts/lib/setup-env";

const EXAMPLE = [
  "# A comment",
  "DATABASE_URL=mysql://user:password@localhost:3306/db",
  "",
  "# Next Auth",
  "NEXTAUTH_SECRET=",
  "NEXTAUTH_URL=http://localhost:3000",
  "",
  "STUDYAPP_ENCRYPTION_KEY=",
  "GOOGLE_CLIENT_ID=",
  "METRICS_API_USER=localhost",
  "",
].join("\n");

describe("generateEncryptionKey", () => {
  it("is exactly 32 characters", () => {
    // packages/env/server/server.mjs validates this with z.string().length(32);
    // any other length fails env validation at startup.
    for (let i = 0; i < 50; i++) {
      expect(generateEncryptionKey()).toHaveLength(32);
    }
  });

  it("differs between calls", () => {
    expect(generateEncryptionKey()).not.toBe(generateEncryptionKey());
  });

  it("contains no padding characters", () => {
    // 24 bytes divides evenly into base64, so there should never be "=".
    for (let i = 0; i < 20; i++) {
      expect(generateEncryptionKey()).not.toContain("=");
    }
  });
});

describe("generateSecret", () => {
  it("differs between calls", () => {
    expect(generateSecret()).not.toBe(generateSecret());
  });

  it("is long enough to satisfy the schema minimum", () => {
    expect(generateSecret().length).toBeGreaterThanOrEqual(1);
  });
});

describe("applyEnvOverrides", () => {
  it("replaces an empty value", () => {
    const out = applyEnvOverrides(EXAMPLE, { NEXTAUTH_SECRET: "abc" });
    expect(out).toContain("NEXTAUTH_SECRET=abc");
  });

  it("replaces an existing value", () => {
    const out = applyEnvOverrides(EXAMPLE, { DATABASE_URL: "mysql://x" });
    expect(out).toContain("DATABASE_URL=mysql://x");
    expect(out).not.toContain("mysql://user:password@localhost:3306/db");
  });

  it("leaves comments, blank lines and untouched keys alone", () => {
    const out = applyEnvOverrides(EXAMPLE, { NEXTAUTH_SECRET: "abc" });
    expect(out).toContain("# A comment");
    expect(out).toContain("# Next Auth");
    expect(out).toContain("NEXTAUTH_URL=http://localhost:3000");
    expect(out).toContain("METRICS_API_USER=localhost");
    expect(out).toContain("GOOGLE_CLIENT_ID=");
  });

  it("preserves key order", () => {
    const out = applyEnvOverrides(EXAMPLE, { NEXTAUTH_SECRET: "abc" });
    expect(out.indexOf("DATABASE_URL")).toBeLessThan(
      out.indexOf("NEXTAUTH_SECRET"),
    );
    expect(out.indexOf("NEXTAUTH_SECRET")).toBeLessThan(
      out.indexOf("STUDYAPP_ENCRYPTION_KEY"),
    );
  });

  it("appends a key the example does not mention", () => {
    const out = applyEnvOverrides(EXAMPLE, { BRAND_NEW: "1" });
    expect(out).toContain("BRAND_NEW=1");
  });

  it("does not match a key mentioned inside a comment", () => {
    const out = applyEnvOverrides("# DATABASE_URL=nope\nDATABASE_URL=\n", {
      DATABASE_URL: "set",
    });
    expect(out).toContain("# DATABASE_URL=nope");
    expect(out).toContain("DATABASE_URL=set");
  });

  it("normalizes CRLF input", () => {
    const out = applyEnvOverrides("A=1\r\nB=2\r\n", { A: "x" });
    expect(out).not.toContain("\r");
    expect(out).toContain("A=x");
    expect(out).toContain("B=2");
  });
});

describe("buildLocalEnv", () => {
  it("points the database at Homebrew MySQL over TCP", () => {
    const out = buildLocalEnv(EXAMPLE);
    expect(out).toContain(`DATABASE_URL=${LOCAL_DATABASE_URL}`);
    // "localhost" makes MySQL clients try a unix socket; Prisma wants TCP.
    expect(LOCAL_DATABASE_URL).toContain("127.0.0.1");
  });

  it("fills both secrets", () => {
    const out = buildLocalEnv(EXAMPLE);
    expect(out).not.toContain("NEXTAUTH_SECRET=\n");
    expect(out).not.toContain("STUDYAPP_ENCRYPTION_KEY=\n");
  });

  it("writes an encryption key of exactly 32 characters", () => {
    const line = buildLocalEnv(EXAMPLE)
      .split("\n")
      .find((l) => l.startsWith("STUDYAPP_ENCRYPTION_KEY="))!;
    expect(line.slice("STUDYAPP_ENCRYPTION_KEY=".length)).toHaveLength(32);
  });

  it("leaves Google credentials empty", () => {
    // Optional outside production; local sign-in uses the magic link.
    expect(buildLocalEnv(EXAMPLE)).toContain("GOOGLE_CLIENT_ID=\n");
  });
});
