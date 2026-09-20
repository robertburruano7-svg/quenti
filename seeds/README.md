# Seed files

Flashcards live in the database, not in this repo. These files are a tracked
copy of chosen sets, plus two commands to move content in either direction.

```sh
bun run sets:push          # repo files  ->  database
bun run sets:pull          # database    ->  repo files
```

The direction is always explicit. Neither command merges; push overwrites the
database from the file, pull overwrites the file from the database. Drift
between the two is detected and refused rather than silently resolved.

Both commands read `DATABASE_URL` from `.env`, the same as every other script
here.

## Format

`seeds/sets/<name>.tsv`:

```
title: Spanish Verbs
description: Common irregular verbs
visibility: Private
wordLanguage: es
definitionLanguage: en
tags: verbs, spanish
id: clx1234567890abcdefghijkl
checksum: 9f2a...
---
hablar	to speak	clxaaaaaaaaaaaaaaaaaaaaaaa
comer	to eat	clxbbbbbbbbbbbbbbbbbbbbbbb
nuevo	new
```

`title` is the only required header. The rest default to an empty description,
`Private`, and `en` for both languages.

Below the `---`, one card per line, tab-separated:

| Column | Meaning                                                |
| ------ | ------------------------------------------------------ |
| 1      | the term                                               |
| 2      | the definition                                         |
| 3      | the card's database id, filled in by the script        |
| 4      | an image url, echoed on pull and never written by push |

**Write new cards with just the first two columns.** The script adds the id
after inserting the card. Since the app's own paste importer reads only the
first two columns and ignores the rest, a file body can be pasted straight into
the set editor's Import box, ids and all.

`id` and `checksum` in the header are maintained by the script. Don't hand-edit
them.

Tabs, newlines and backslashes inside a card are written as `\t`, `\n` and `\\`,
so a multi-line definition round-trips intact.

## Adding a set

Write a file with a `title` and at least two cards, then push:

```sh
bun run sets:push --dry-run    # see what would happen
bun run sets:push
```

Push writes the new set's id and every card id back into the file. Commit that.

## Tracking a set you made in the app

```sh
bun run sets:pull --set https://your-domain/clx1234567890abcdefghijkl
```

Accepts a full URL or a bare id. The file is named from the set's title. Pull
only touches sets that already have a file, so nothing else in your library is
affected.

## Flags

| Flag                 | Effect                                                                 |
| -------------------- | ---------------------------------------------------------------------- |
| `--dry-run`          | Print the plan, write nothing. Still performs every read-side check.   |
| `--force`            | Push even though the set changed in the app since the last sync.       |
| `--allow-deletes`    | Delete cards that carry study progress or an image.                    |
| `--recreate-missing` | A card id in the file is not in the database; insert it as a new card. |
| `--recreate`         | The whole set is gone from the database; insert it as a new set.       |

Without `--allow-deletes`, push refuses to delete any card you have studied or
starred, and names them. Without `--force`, push refuses to run at all when the
app has changed the set since the last pull.

You can also pass specific files: `bun run sets:push seeds/sets/spanish.tsv`.

## Things worth knowing

**Close the set editor before pushing.** The editor autosaves with an
`INSERT ... ON DUPLICATE KEY UPDATE`, so if a push deletes cards while a tab has
the set open, the next autosave re-inserts them under their old ids and you get
duplicates. The checksum guard catches most cases but not a tab open during the
push itself.

**Cards are matched by id, never by position.** This is why the third column
exists. If cards were matched by line number, reordering them in the app and
then editing the file would reassign your study progress to the wrong cards
without anything appearing broken.

**Images survive but can't be set from a file.** A card's image is echoed into
the fourth column on pull and left untouched by push. Add images in the app.

**Formatting is not represented.** Bold, italics and highlights live in a
separate column the file doesn't carry. A card whose text you don't change keeps
its formatting. A card whose text you do change has its formatting cleared,
because it no longer corresponds to the new text. Push tells you when this is
about to happen.

**Deleting a file does not delete the set.** Push reports sets in the database
with no file, and leaves them alone. Delete sets in the app.

## Checking it worked

Running `bun run sets:pull` immediately after a push should produce no git diff.
If it does produce one, the file and the database disagree about something and
that is worth looking at before going further.
