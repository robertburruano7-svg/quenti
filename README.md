# Studyapp

A personal fork of [Quenti](https://github.com/quenti-io/quenti), the open-source
Quizlet alternative. It runs on one machine and is not deployed anywhere.

`Studyapp` is a placeholder name. To pick a real one, start at
`packages/branding/index.ts` — the header comment lists every other place the
name is hardcoded.

## The Stack

- [Next.js](https://nextjs.org)
- [tRPC](https://trpc.io)
- [NextAuth](https://next-auth.js.org)
- [Prisma](https://prisma.io)
- [Chakra UI](https://chakra-ui.com)
- [MySQL](http://mysql.org/)
- [Zustand](https://github.com/pmndrs/zustand)

## Running it on a Mac

One-time setup, starting from a Mac with nothing installed. Run the blocks in
order; each assumes the previous one worked, so stop if something errors rather
than pushing on. Nothing here needs Xcode: every native dependency ships a
prebuilt `darwin-arm64` binary.

### 1. Homebrew

The `which brew ||` guard means this is safe to run if you already have it.

```sh
which brew || /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
brew --version
```

Those two middle lines are not optional. On Apple Silicon the installer puts
brew at `/opt/homebrew/bin`, which is not on the default `PATH`, so `brew` still
reports "command not found" immediately after installing successfully. Stop here
if `brew --version` prints nothing.

### 2. bun, Node and MySQL

**Do not skip this block.** The next one clones the project and looks
self-contained, but nothing after this point works without bun.

```sh
brew install bun node mysql
bun --version
```

Node is here because several binaries in the dependency tree carry a
`#!/usr/bin/env node` shebang, and the scripts under `scripts/` run through
`ts-node`. Stop here if `bun --version` prints nothing.

### 3. The project and the database

```sh
git clone https://github.com/robertburruano7-svg/quenti ~/quenti
cd ~/quenti

brew services start mysql
mysql -u root -e "CREATE DATABASE IF NOT EXISTS studyapp"
```

`git` arrives with the Xcode command line tools, which the Homebrew installer
pulls in, so by now you have it.

### 4. Install and run

```sh
bun install
bun run setup:local     # writes .env with generated secrets
bun db:push             # creates the tables
bun dev
```

`setup:local` refuses to run if `.env` already exists, so it will not quietly
regenerate your encryption key — doing that would invalidate every signed asset
URL already in the database.

Then open http://localhost:3000.

That is setup done. Day to day it is just `bun dev`, or double-clicking the app
built in the next section.

_If Homebrew MySQL gives you trouble, `docker-compose -f docker-compose.mysql.yml up -d`
still works; point `DATABASE_URL` at `mysql://user:password@127.0.0.1:3306/db`._

### Make it an app

```sh
bun run make:app
```

Builds `Studyapp.app` in the project folder. Drag it to `/Applications` or your
Dock and double-click: it starts MySQL if it is down, starts the server, and
opens a window with no address bar or tabs. Closing the window stops the server.

The project path is baked into the bundle, because an app launched from Finder
starts in `/` and inherits none of your shell's environment. **Re-run
`make:app` if you move the repo.**

It uses its own Chrome profile under
`~/Library/Application Support/Studyapp`, so the window is independent of your
normal browsing and keeps its own login session. Without Chrome installed it
falls back to your default browser.

Anything that goes wrong is written to `~/Library/Logs/Studyapp/launcher.log`
and raised as a dialog, since an app launched from Finder has nowhere to print.

Two things it deliberately refuses to do. If port 3000 is held by something
that is not this app, it stops and says so rather than starting: `next dev`
would otherwise move to 3001 while `.env` still points at 3000, which breaks
sign-in in a way that is hard to diagnose. And if `.env` is missing it points
you at `setup:local` instead of failing silently.

The app runs the dev server rather than a production build, so the first page
after launch takes a few seconds to compile. That is deliberate: a production
build requires Google credentials and stops the magic-link sign-in from being
printed.

### Signing in

Google is the only OAuth provider, and you do not need it. Go to
http://localhost:3000/auth/login, enter any email address, and press the arrow.
The sign-in link is printed to the terminal running `bun dev`:

```
  Magic link for you@example.com:
  http://localhost:3000/api/auth/callback/magic?token=...
```

Paste it into the browser. Nothing is bypassed: the token is still required and
still expires, it is just delivered to your terminal instead of an inbox,
because `RESEND_API_KEY` is unset. The link is only printed when `NODE_ENV` is
exactly `development`.

First sign-in drops you into `/onboarding`, which you have to finish before the
rest of the app will load: theme, username, account type, then done. Picking a
username matters beyond onboarding — the API rejects every request from a user
without one.

One wart: the Google button still renders on the login page and will error if
clicked, because the button list is hardcoded rather than read from the
configured providers. Use the email box.

### What it talks to

A local run makes no analytics, error-reporting or logging calls. Highlight,
Axiom, Jitsu, ClickHouse, Upstash, Resend, Unsplash and HuggingFace are each
gated on an API key that is unset, and Inngest is pinned to dev mode so it
never reaches Inngest Cloud.

Two outbound calls do happen. `next/font/google` downloads the Outfit and Open
Sans woff2 files on first compile and then self-hosts them, so a cold build with
no network fails. And `next/image` fetches `lh3.googleusercontent.com` only if
you sign in with Google, which the magic-link flow avoids.

### Optional services

The app runs on the defaults above. These stay off until you add credentials:

| Feature                                        | Needs                                                           |
| ---------------------------------------------- | --------------------------------------------------------------- |
| Invite emails, magic links by email            | `RESEND_API_KEY`, `EMAIL_SENDER`                                |
| Image uploads on cards                         | Cloudflare R2 plus the CDN worker, removed from this fork       |
| Background jobs (Quizlet import, bulk invites) | An Inngest dev server on port 8288                              |
| Unsplash image search                          | `UNSPLASH_ACCESS_KEY`                                           |
| Cortex answer grading                          | `COHERE_API_KEY`, `HUGGINGFACE_ENDPOINT`, `HUGGINGFACE_API_KEY` |
| Organization billing                           | The `STRIPE_*` variables                                        |
| Organization analytics                         | The `CLICKHOUSE_*` variables                                    |

Set `BYPASS_ORG_DOMAIN_BLACKLIST=true` to test organization features with a
personal email address.

### A note on `bun run build`

Use `bun dev`. Building sets `NODE_ENV=production`, which flips
`NEXTAUTH_SECRET` and the Google credentials to required in the env schema, so a
build fails on a setup that has no OAuth client.

## Flashcards in the repo

Cards live in the database, but chosen sets are tracked as files under
`seeds/sets/` and synced in either direction:

```sh
bun run sets:sync    # git pull, then load any new or changed sets
bun run sets:pull    # database -> repo files
```

`sets:sync` is the one to run after Claude commits a set. See
[seeds/README.md](./seeds/README.md) for the file format and the flags.

For a one-off import with no files involved, the set editor's Import button
accepts tab-separated cards pasted directly.

## Assets still carrying upstream branding

The rename covered code and copy, not binaries. These still show the Quenti
logo and wordmark:

- `apps/next/public/og-image.png`
- `apps/next/public/avatars/studyapp.png`
- the favicons and `android-chrome-*.png` in `apps/next/public`
