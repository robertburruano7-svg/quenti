import { env as clientEnv } from "@studyapp/env/client";
import { env as serverEnv } from "@studyapp/env/server";

export const IS_PAYMENT_ENABLED = !!(
  serverEnv.STRIPE_PRIVATE_KEY && clientEnv.NEXT_PUBLIC_STRIPE_PUBLIC_KEY
);
