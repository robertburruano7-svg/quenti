import type { NextApiHandler } from "next";
import NextAuth from "next-auth";

import { authOptions } from "@studyapp/auth/next-auth-options";

export default NextAuth(authOptions) as NextApiHandler;
