# Deploying Studyapp to Vercel

This is a single-tenant deployment: one Vercel project serving the Next.js app
in `apps/next`, backed by a hosted MySQL database. The marketing site, admin
console and integrations packages live in private upstream repositories and are
not part of this fork, so this deploys the app only.

## Cost

Everything below is free, with no card required and no trial clock.

| Piece    | Free tier                    |
| -------- | ---------------------------- |
| Hosting  | Vercel Hobby                 |
| Database | TiDB Cloud Starter           |
| Sign-in  | Google OAuth                 |
| Domain   | the `*.vercel.app` subdomain |

**Vercel Hobby is personal, non-commercial use only.** That is a licence term,
not a soft limit: running anything revenue-generating on it requires Pro.

The optional services are the only way to spend money here, and the app runs
without all of them. See the table at the end of this document for what each one
switches on.

## Node version

The build requires **Node 20 or newer**. There is no upper bound: the import
assertion in `apps/next/next.config.mjs` was migrated from `assert` to `with`,
so Node 22 and 24 both build cleanly.

## 1. Database

Any MySQL 8 host that gives you a connection string works. The Prisma schema
sets `relationMode = "prisma"`, so foreign keys are enforced in the application
rather than the database, which means hosts that forbid foreign keys are fine
too.

**Recommended: [TiDB Cloud Starter](https://tidbcloud.com).** MySQL-compatible,
free with no time limit, and it is not deleted for inactivity. It hibernates
after about a day idle and wakes on the next connection, so expect one slow
query after a quiet spell.

Two alternatives were considered and rejected for this use case. Aiven's free
MySQL powers off after a period of inactivity, and Supabase would mean migrating
to Postgres. Both are fine if you use the app daily; neither suits something
opened a few times a week.

**TiDB requires TLS.** Append `?sslaccept=strict` to the connection string:

```
mysql://user:password@host:4000/dbname?sslaccept=strict
```

Without it Prisma fails with a handshake error that does not mention TLS.

Once you have a `DATABASE_URL`, create the schema from your machine:

```sh
echo 'DATABASE_URL=mysql://...' > .env
bun install
bun prisma db:push
```

`db:push` applies the schema directly. There are no migration files in this
repo, so treat the schema as the source of truth.

The `sets:push` and `sets:pull` scripts read the same `DATABASE_URL`, so they
work against a hosted database unchanged. See [seeds/README.md](./seeds/README.md).

### A note on MySQL compatibility

TiDB is MySQL-compatible rather than MySQL. The app's card editor uses raw
`INSERT ... ON DUPLICATE KEY UPDATE` statements for reordering and shuffle
state, which TiDB supports, but this fork has not been exercised against it.
After deploying, create a set, reorder its cards, and run one round of Learn.
That exercises every one of those queries. If card order survives, you are
clear.

## 2. Google OAuth

Google is the only sign-in method in this build. Create an OAuth client ID at
the [Google API Console](https://console.developers.google.com/):

- Authorized JavaScript origin: `https://your-domain.com`
- Authorized redirect URI: `https://your-domain.com/api/auth/callback/google`

Add `http://localhost:3000` and its callback as a second pair if you also want
to run locally.

## 3. Environment variables

Set these in the Vercel project, for the Production environment at minimum.
All eight are required; the app fails env validation at build time without them.

| Variable                  | Notes                                                     |
| ------------------------- | --------------------------------------------------------- |
| `DATABASE_URL`            | MySQL connection string from step 1                       |
| `NEXTAUTH_SECRET`         | `openssl rand -base64 32`                                 |
| `NEXTAUTH_URL`            | Your production URL, e.g. `https://your-domain.com`       |
| `STUDYAPP_ENCRYPTION_KEY` | Exactly 32 characters. `openssl rand -base64 24` gives 32 |
| `GOOGLE_CLIENT_ID`        | From step 2                                               |
| `GOOGLE_CLIENT_SECRET`    | From step 2                                               |
| `METRICS_API_USER`        | Guards `/api/metrics`. Any value                          |
| `METRICS_API_PASSWORD`    | Guards `/api/metrics`. Any value                          |
| `NEXT_PUBLIC_APP_URL`     | Your production URL. Read at build time                   |

Set `NEXTAUTH_URL` explicitly even though the env schema falls back to
`VERCEL_URL`. That fallback resolves to the per-deployment URL, which changes on
every deploy and will not match the redirect URI registered with Google.

Also set `NEXT_PUBLIC_WEBSITE_URL` to your own URL. Without it, `WEBSITE_URL`
falls back to the `studyapp.example` placeholder and the footer links point at a
domain you do not own.

## 4. Deploy

Import the repository in Vercel. The `vercel.json` at the repo root pins the
install and build commands, so leave Root Directory as the repository root:

- Install: `bun install` (also generates the Prisma client via the
  `packages/prisma` postinstall hook)
- Build: `bun run build`, which runs `turbo build --filter @studyapp/next...`
- Output: `apps/next/.next`

Do **not** use `install-vercel.sh` as the install command. That script is
upstream's, and it clones three private `quenti-io` repositories that this fork
has no access to.

## What is missing without optional services

The app runs with the eight required variables above, but these features stay
off until you add credentials:

| Feature                                                                | Needs                                                                                                                                           |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Invite emails, magic links                                             | `RESEND_API_KEY`, `EMAIL_SENDER`                                                                                                                |
| Image uploads on flashcards                                            | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `USERS_BUCKET_NAME`, `USERS_BUCKET_URL`, `ASSETS_BUCKET_NAME`, `ASSETS_BUCKET_URL` |
| Background jobs (Quizlet import, bulk invites, scheduled org deletion) | An Inngest app pointed at `/api/inngest`                                                                                                        |
| Unsplash image search                                                  | `UNSPLASH_ACCESS_KEY`                                                                                                                           |
| Cortex answer grading                                                  | `COHERE_API_KEY`, `HUGGINGFACE_ENDPOINT`, `HUGGINGFACE_API_KEY`                                                                                 |
| Organization billing                                                   | `STRIPE_PRIVATE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_ORG_MONTHLY_PRICE_ID`, `NEXT_PUBLIC_STRIPE_PUBLIC_KEY`                                   |
| Organization analytics                                                 | `ENABLE_CLICKHOUSE`, `CLICKHOUSE_HOST`, `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`                                                                |
| Error and log telemetry                                                | `NEXT_PUBLIC_HIGHLIGHT_PROJECT_ID`, Axiom                                                                                                       |

Set `BYPASS_ORG_DOMAIN_BLACKLIST=true` if you want to test organization features
with a personal Google account. Consumer domains are blacklisted otherwise.

`apps/cdn` is a separate Cloudflare Worker that serves signed image URLs. It is
deployed independently with `wrangler` from `apps/cdn`, using
`wrangler.example.toml` as a starting point, and is only needed alongside R2.

## Licensing

This fork is AGPL-3.0. Serving it over a network counts as distribution under
section 13, so keep the GitHub repository public to satisfy the source-offer
requirement.
