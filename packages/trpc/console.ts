/**
 * The admin console is a private upstream repository and is not part of this
 * fork. Both callers already wrap this in a try/catch and treat a failure as
 * "the console has no opinion", so rejecting keeps their behaviour unchanged.
 *
 * The return type is kept as it was so those call sites still type-check;
 * Promise.reject satisfies any Promise type.
 */
export const importConsole = (
  path: string,
): Promise<{ usernameAvailable: (username: string) => boolean }> =>
  Promise.reject(
    new Error(
      `@studyapp/console is not part of this fork, so "${path}" cannot be loaded.`,
    ),
  );
