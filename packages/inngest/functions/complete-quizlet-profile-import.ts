import { sendProfileImportCompleteEmail } from "@studyapp/emails";
import { env } from "@studyapp/env/client";
import { prisma } from "@studyapp/prisma";

import { inngest } from "../inngest";

export const completeQuizletProfileImport = inngest.createFunction(
  {
    id: "complete-quizlet-profile-import",
    debounce: {
      period: "5m",
      key: "event.data.userId",
    },
    idempotency: "event.data.userId",
  },
  {
    event: "integrations/quizlet/complete-import-profile",
  },
  async ({ event, step }) => {
    const user = await step.run(
      "get-user",
      async () =>
        await prisma.user.findUniqueOrThrow({
          where: { id: event.data.userId },
          select: {
            email: true,
            username: true,
            image: true,
          },
        }),
    );

    await step.run("send-import-complete-email", async () => {
      await sendProfileImportCompleteEmail(user.email, {
        avatarUrl:
          user.image || "https://studyapp.example/avatars/studyapp.png",
        profileUrl: `${env.NEXT_PUBLIC_APP_URL}/@${user.username}`,
      });
    });
  },
);
