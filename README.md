# Studyapp

A personal fork of [Quenti](https://github.com/quenti-io/quenti), the open-source
Quizlet alternative. Renamed throughout: the workspace scope is `@studyapp/*`,
the encryption key env var is `STUDYAPP_ENCRYPTION_KEY`, and the placeholder
domain is `studyapp.example`.

`Studyapp` is a placeholder. To pick a real name, start at
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
- [ClickHouse](https://clickhouse.tech/)

## Running Locally

Get up and running by following these steps.

### Prerequisites

- Node.js 20.x or newer
- MySQL
- Bun
- Docker and docker-compose _(recommended)_

### Setup

1. Clone the repo

   ```sh
   git clone https://github.com/robertburruano7-svg/quenti
   ```

2. Go to the project folder

   ```sh
   cd quenti
   ```

3. Install dependencies with bun

   ```sh
   bun i
   ```

4. Set up the `.env` file

   - Copy `.env.example` to `.env`
   - Use `openssl rand -base64 32` to generate a key for `NEXTAUTH_SECRET` and set it as the value in `.env`
   - Use `openssl rand -base64 24` to generate a key for `STUDYAPP_ENCRYPTION_KEY` and set it as the value in `.env`
   - You'll need to create a Google OAuth client ID from the [Google API Console](https://console.developers.google.com/). There are plenty of guides for this, like [this one from LogRocket](https://blog.logrocket.com/nextauth-js-for-next-js-client-side-authentication/#create-a-google-oauth-app) embedded:

     > ![Google OAuth Client Screenshot](https://files.readme.io/eca93af-GCPStep2OAuth.png)
     >
     > Navigate to Credentials and click on Create credentials, and then OAuth client ID. You will be asked to fill in the following:
     >
     > **Choose an Application Type**: Select Web Application
     >
     > **Name**: This is the name of your application
     >
     > **Authorized JavaScript origins**: This is the full URL to the homepage of our app. Since we are still in development mode, we are going to fill in the full URL our development server is running on. In this case, it is `http://localhost:3000`
     >
     > **Authorized redirect URIs**: Users will be redirected to this path after they have authenticated with Google: `http://localhost:3000/api/auth/callback/google`

     Copy your client ID and secret created and fill in the `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` values in `.env`

     ![ID and Secret Screenshot](https://files.readme.io/a136be9-GCPOAuthstep5.png)

5. Start up a local MySQL database with

   ```sh
   docker-compose -f docker-compose.mysql.yml up
   ```

6. Push schema changes and generate the Prisma client
   ```sh
   bun prisma db:push
   ```

### Running

Start a development server with

```sh
bun dev
```

or create and start a production build with

```
bun run build
bun start
```

Navigate to http://localhost:3000 and Studyapp should be up and running!

## Flashcards in the repo

Cards live in the database, but chosen sets can be tracked as files under
`seeds/sets/` and synced in either direction:

```sh
bun run sets:push          # repo files  ->  database
bun run sets:pull          # database    ->  repo files
```

See [seeds/README.md](./seeds/README.md) for the file format and flags. For a
one-off import with no files involved, the set editor's Import button accepts
tab-separated cards pasted directly.

## Hosting

See [DEPLOYMENT.md](./DEPLOYMENT.md) for deploying the app to Vercel: the
required environment variables, the Google OAuth setup, and which features stay
off until you add optional service credentials.

## Private submodules

`apps/website`, `packages/console`, and `packages/integrations` are git
submodules pointing at private `quenti-io` repositories. They are not part of
this fork and cannot be cloned without access, so `.gitmodules` and
`install-vercel.sh` still reference upstream. The Next.js app builds without
them; the marketing site and admin console do not.

## Assets still carrying upstream branding

The rename covered code and copy, not binaries. These still show the Quenti
logo and wordmark:

- `apps/next/public/og-image.png`
- `apps/next/public/avatars/studyapp.png`
- the favicons and `android-chrome-*.png` in `apps/next/public`
