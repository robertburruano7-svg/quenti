import {
  type SeedSet,
  checksumOf,
  escapeField,
  isBlank,
  parse,
  serialize,
  serializeBody,
  slugify,
  unescapeField,
} from "../scripts/lib/sets-file";

const base: SeedSet = {
  title: "Spanish Verbs",
  description: "Common irregular verbs",
  visibility: "Private",
  wordLanguage: "es",
  definitionLanguage: "en",
  tags: ["verbs", "spanish"],
  id: "clx1234567890abcdefghijkl",
  terms: [
    {
      word: "hablar",
      definition: "to speak",
      id: "clxaaaaaaaaaaaaaaaaaaaaaaa",
    },
    { word: "comer", definition: "to eat", id: "clxbbbbbbbbbbbbbbbbbbbbbbb" },
  ],
};

describe("escaping", () => {
  it.each([
    "plain",
    "with\ttab",
    "with\nnewline",
    "with\\backslash",
    "all\tthree\nat\\once",
    "",
  ])("round-trips %j", (value) => {
    expect(unescapeField(escapeField(value))).toBe(value);
  });

  it("never emits a raw tab or newline", () => {
    const escaped = escapeField("a\tb\nc");
    expect(escaped).not.toMatch(/[\t\n]/);
  });

  it("keeps a lone backslash rather than swallowing it", () => {
    expect(unescapeField("C:\\x")).toBe("C:\\x");
  });
});

describe("parse and serialize", () => {
  it("round-trips a set byte-for-byte", () => {
    const text = serialize(base);
    const { set } = parse("test.tsv", text);
    expect(serialize(set)).toBe(text);
  });

  it("preserves every field through a round-trip", () => {
    const { set } = parse("test.tsv", serialize(base));
    expect(set.title).toBe(base.title);
    expect(set.description).toBe(base.description);
    expect(set.visibility).toBe(base.visibility);
    expect(set.wordLanguage).toBe(base.wordLanguage);
    expect(set.definitionLanguage).toBe(base.definitionLanguage);
    expect(set.tags).toEqual(base.tags);
    expect(set.id).toBe(base.id);
    expect(set.terms).toEqual(base.terms);
  });

  it("round-trips a multi-line description", () => {
    const set: SeedSet = {
      ...base,
      description: "First line.\nSecond line.\n\nFourth.",
    };
    const parsed = parse("test.tsv", serialize(set)).set;
    expect(parsed.description).toBe(set.description);
    expect(serialize(parsed)).toBe(serialize(set));
  });

  it("round-trips a card containing tabs and newlines", () => {
    const set: SeedSet = {
      ...base,
      terms: [
        { word: "a\tb", definition: "c\nd", id: "clxaaaaaaaaaaaaaaaaaaaaaaa" },
        {
          word: "back\\slash",
          definition: "ok",
          id: "clxbbbbbbbbbbbbbbbbbbbbbbb",
        },
      ],
    };
    const parsed = parse("test.tsv", serialize(set)).set;
    expect(parsed.terms).toEqual(set.terms);
  });

  it("keeps a card with an empty definition", () => {
    const set: SeedSet = {
      ...base,
      terms: [
        { word: "solo", definition: "", id: "clxaaaaaaaaaaaaaaaaaaaaaaa" },
        {
          word: "comer",
          definition: "to eat",
          id: "clxbbbbbbbbbbbbbbbbbbbbbbb",
        },
      ],
    };
    const parsed = parse("test.tsv", serialize(set)).set;
    expect(parsed.terms[0]).toEqual({
      word: "solo",
      definition: "",
      id: "clxaaaaaaaaaaaaaaaaaaaaaaa",
    });
  });

  it("round-trips an asset url in the fourth column", () => {
    const set: SeedSet = {
      ...base,
      terms: [
        {
          word: "gato",
          definition: "cat",
          id: "clxaaaaaaaaaaaaaaaaaaaaaaa",
          assetUrl: "https://cdn.example/a.png",
        },
        {
          word: "comer",
          definition: "to eat",
          id: "clxbbbbbbbbbbbbbbbbbbbbbbb",
        },
      ],
    };
    const parsed = parse("test.tsv", serialize(set)).set;
    expect(parsed.terms).toEqual(set.terms);
  });

  it("treats CRLF input as identical to LF", () => {
    const text = serialize(base);
    const crlf = text.replace(/\n/g, "\r\n");
    expect(parse("test.tsv", crlf)).toEqual(parse("test.tsv", text));
  });

  it("does not trim field values", () => {
    // The app does not trim, so trimming here would make every pulled file
    // differ from the database forever.
    const set: SeedSet = {
      ...base,
      terms: [
        {
          word: " leading",
          definition: "trailing ",
          id: "clxaaaaaaaaaaaaaaaaaaaaaaa",
        },
        {
          word: "comer",
          definition: "to eat",
          id: "clxbbbbbbbbbbbbbbbbbbbbbbb",
        },
      ],
    };
    const parsed = parse("test.tsv", serialize(set)).set;
    expect(parsed.terms[0]!.word).toBe(" leading");
    expect(parsed.terms[0]!.definition).toBe("trailing ");
  });

  it("reads a hand-written file with no ids and no checksum", () => {
    const text = ["title: Quick", "---", "uno\tone", "dos\ttwo", ""].join("\n");
    const { set } = parse("test.tsv", text);
    expect(set.title).toBe("Quick");
    expect(set.id).toBeUndefined();
    expect(set.checksum).toBeUndefined();
    expect(set.terms).toEqual([
      { word: "uno", definition: "one" },
      { word: "dos", definition: "two" },
    ]);
  });

  it("splits on the first separator only", () => {
    const text = ["title: Dashes", "---", "a\tb", "---\t-", ""].join("\n");
    const { set } = parse("test.tsv", text);
    expect(set.terms).toHaveLength(2);
    expect(set.terms[1]).toEqual({ word: "---", definition: "-" });
  });

  it("rejects a file with no separator", () => {
    expect(() => parse("test.tsv", "title: Nope\na\tb\n")).toThrow(/separator/);
  });

  it("rejects an unknown header key", () => {
    expect(() => parse("test.tsv", "title: X\nnope: 1\n---\na\tb\n")).toThrow(
      /unknown header key/,
    );
  });

  it("rejects a duplicate header key", () => {
    expect(() => parse("test.tsv", "title: X\ntitle: Y\n---\na\tb\n")).toThrow(
      /duplicate header key/,
    );
  });

  it("rejects a line with too many columns", () => {
    expect(() => parse("test.tsv", "title: X\n---\na\tb\tc\td\te\n")).toThrow(
      /at most 4/,
    );
  });

  it("reports the file name and line number", () => {
    expect(() => parse("cards.tsv", "title: X\n---\na\tb\tc\td\te\n")).toThrow(
      /^cards\.tsv:3:/,
    );
  });
});

describe("checksum", () => {
  it("is stable for identical bodies", () => {
    const body = serializeBody(base.terms);
    expect(checksumOf(body)).toBe(checksumOf(serializeBody(base.terms)));
  });

  it("changes when a card changes", () => {
    const changed = serializeBody([
      { ...base.terms[0]!, definition: "to talk" },
      base.terms[1]!,
    ]);
    expect(checksumOf(changed)).not.toBe(checksumOf(serializeBody(base.terms)));
  });

  it("changes when cards are reordered", () => {
    const reordered = serializeBody([base.terms[1]!, base.terms[0]!]);
    expect(checksumOf(reordered)).not.toBe(
      checksumOf(serializeBody(base.terms)),
    );
  });

  it("matches the checksum written into the file", () => {
    const { set, body } = parse("test.tsv", serialize(base));
    expect(set.checksum).toBe(checksumOf(body));
  });
});

describe("isBlank", () => {
  it("is blank only when both sides are empty", () => {
    // Mirrors the app's rule at study-sets/create.handler.ts.
    expect(isBlank({ word: "", definition: "" })).toBe(true);
    expect(isBlank({ word: "  ", definition: "\t" })).toBe(true);
    expect(isBlank({ word: "a", definition: "" })).toBe(false);
    expect(isBlank({ word: "", definition: "b" })).toBe(false);
  });
});

describe("slugify", () => {
  it.each([
    ["Spanish Verbs", "spanish-verbs"],
    ["  Mixed   Case  ", "mixed-case"],
    ["Ünïcode & symbols!", "unicode-symbols"],
    ["Español", "espanol"],
    ["", "set"],
    ["!!!", "set"],
  ])("%j becomes %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
});
