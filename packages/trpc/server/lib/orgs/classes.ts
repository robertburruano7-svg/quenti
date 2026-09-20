import { prisma } from "@studyapp/prisma";

export const bulkJoinOrgClasses = async (orgId: string) => {
  await prisma.class.updateMany({
    where: {
      orgId: null,
      members: {
        some: {
          type: "Teacher",
          user: {
            organizationId: orgId,
          },
          deletedAt: null,
        },
      },
    },
    data: {
      orgId,
    },
  });
};
