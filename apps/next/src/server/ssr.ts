import type { GetServerSidePropsContext } from "next";
import { type AxiomAPIRequest, log } from "next-axiom";
import superjson from "superjson";

import { getServerAuthSession } from "@studyapp/auth";
import { createServerSideHelpers } from "@studyapp/trpc/react/server";
import { createContext } from "@studyapp/trpc/server/context";
import { appRouter } from "@studyapp/trpc/server/root";

export const ssrInit = async (context: GetServerSidePropsContext) => {
  const ctx = createContext({
    ...context,
    req: { ...context.req, log } as AxiomAPIRequest,
  });
  const session = await getServerAuthSession(context);

  const ssr = createServerSideHelpers({
    router: appRouter,
    transformer: superjson,
    ctx: {
      ...ctx,
      session: session ?? null,
    },
  });

  await ssr.user.me.prefetch();

  return ssr;
};
