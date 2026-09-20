import type { GetServerSidePropsContext } from "next";
import type { AxiomAPIRequest } from "next-axiom";

import { prisma } from "@studyapp/prisma";

import type { CreateNextContextOptions } from "./adapters/next";

type CreateContextOptions =
  | (CreateNextContextOptions & { req: AxiomAPIRequest })
  | (GetServerSidePropsContext & { req: AxiomAPIRequest });

export const createContext = ({ req, res }: CreateContextOptions) => {
  return {
    prisma,
    req,
    res,
    session: null,
  };
};
