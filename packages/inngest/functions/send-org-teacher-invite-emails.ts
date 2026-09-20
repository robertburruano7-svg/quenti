import { sendOrganizationTeacherInviteEmail } from "@studyapp/emails";
import { env } from "@studyapp/env/client";

import { inngest } from "../inngest";

export const sendOrgTeacherInviteEmails = inngest.createFunction(
  { id: "send-org-teacher-invite-emails" },
  { event: "orgs/invite-teachers" },
  async ({ event, step }) => {
    await Promise.all(
      event.data.emails.map((email) =>
        step.run("Send organization teacher invite email", async () => {
          await sendOrganizationTeacherInviteEmail(email, {
            orgName: event.data.org.name,
            inviter: event.data.inviter,
            url: `${env.NEXT_PUBLIC_APP_URL}/auth/signup`,
          });
        }),
      ),
    );
  },
);
