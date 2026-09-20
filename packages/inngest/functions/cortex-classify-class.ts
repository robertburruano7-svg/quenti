import { classifyClass } from "@studyapp/cortex/classify";
import { prisma } from "@studyapp/prisma";

import { inngest } from "../inngest";

export const cortexClassifyClass = inngest.createFunction(
  { id: "cortex-classify-class" },
  { event: "cortex/classify-class" },
  async ({ event }) => {
    const result = await classifyClass(event.data.name);
    if (!result) return;

    const { category, course } = result;

    await prisma.class.update({
      where: {
        id: event.data.classId,
      },
      data: {
        cortexCategory: category,
        cortexCourse: course,
      },
    });
  },
);
