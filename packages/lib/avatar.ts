import type { User } from "@studyapp/prisma/client";

/// Legacy
export const avatarUrl = (user: Pick<User, "username" | "image">): string =>
  user.image!;
