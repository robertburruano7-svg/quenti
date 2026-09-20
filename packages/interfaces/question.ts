import type { StudySetAnswerMode } from "@studyapp/prisma/client";

import type { FacingTerm, StudiableTerm } from "./studiable-term";

export interface Question {
  answerMode: StudySetAnswerMode;
  term: StudiableTerm;
  type: "choice" | "write";
  choices: FacingTerm[];
}
