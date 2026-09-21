import { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

import { env } from "@studyapp/env/server";
import { APP_URL } from "@studyapp/lib/constants/url";
import { prisma } from "@studyapp/prisma";

import pjson from "../../apps/next/package.json";
import { sendVerificationRequest } from "./magic-link";
import { CustomPrismaAdapter } from "./prisma-adapter";

const version = pjson.version;

// NextAuth's public Provider union omits the "email" type even though the
// runtime supports it, so this needs a cast. Declared here rather than inline:
// a `@ts-expect-error` inside the array stops applying as soon as the array
// contains a spread, because the error is then reported on the spread instead.
const magicProvider = {
  id: "magic",
  type: "email",
  sendVerificationRequest,
} as unknown as NextAuthOptions["providers"][number];

export const authOptions: NextAuthOptions = {
  // Include user.id on session
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.username = user.username || "";
        session.user.displayName = user.displayName;
        session.user.type = user.type;
        session.user.banned = !!user.bannedAt;
        session.user.flags = user.flags;
        session.user.completedOnboarding = user.completedOnboarding;
        session.user.organizationId = user.organizationId;
        session.user.isOrgEligible = user.isOrgEligible;

        session.version = version;
      }
      return session;
    },
    redirect({ url, baseUrl }) {
      // Allows relative callback URLs
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      // Allows callback URLs on the same domain
      else if (new URL(url).hostname === new URL(APP_URL).hostname) return url;
      return baseUrl;
    },
    async signIn({ user }) {
      if (env.ENABLE_EMAIL_WHITELIST === "true") {
        if (
          !(await prisma.whitelistedEmail.findUnique({
            where: {
              email: user.email!,
            },
          }))
        )
          return "/unauthorized";
      }

      return true;
    },
  },
  pages: {
    signIn: "/auth/login",
    signOut: "/",
    newUser: "/onboarding",
    verifyRequest: "/auth/verify",
    error: "/auth/error",
  },
  // Configure one or more authentication providers
  adapter: CustomPrismaAdapter(prisma),
  providers: [
    // Passing an undefined clientId fails at runtime in a way that is hard to
    // diagnose, so leave the provider out entirely when it is not configured.
    // The env schema still requires these in production.
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    magicProvider,
    /**
     * ...add more providers here
     *
     * Most other providers require a bit more work than the Discord provider.
     * For example, the GitHub provider requires you to add the
     * `refresh_token_expires_in` field to the Account model. Refer to the
     * NextAuth.js docs for the provider you want to use. Example:
     * @see https://next-auth.js.org/providers/github
     */
  ],
};
