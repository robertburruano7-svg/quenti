import { getPresignedAvatarJwt } from "@studyapp/images/server";

import type { NonNullableUserContext } from "../../lib/types";

type UploadAvatarOptions = {
  ctx: NonNullableUserContext;
};

export const uploadAvatarHandler = ({ ctx }: UploadAvatarOptions) => {
  return getPresignedAvatarJwt(ctx.session.user.id);
};

export default uploadAvatarHandler;
