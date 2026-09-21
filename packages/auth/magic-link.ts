import { sendMagicLinkEmail } from "@studyapp/emails";
import { env } from "@studyapp/env/server";

export const sendVerificationRequest = async (params: {
  identifier: string;
  url: string;
}) => {
  // Without a Resend key the email is silently dropped, so locally there is no
  // way to reach the link. Print it instead. This is not a bypass: the token in
  // the URL is still required and still expires.
  //
  // Gated on an explicit equality rather than `!== "production"` because
  // NODE_ENV is optional in the env schema and may be undefined, and a sign-in
  // URL in aggregated server logs is a real credential leak.
  if (env.NODE_ENV === "development") {
    console.log(`\n  Magic link for ${params.identifier}:\n  ${params.url}\n`);
  }

  await sendMagicLinkEmail(params.identifier, params);
};
