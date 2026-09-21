/**
 * The integrations package is a private upstream repository and is not part of
 * this fork, so there is nothing to import. This previously resolved to an
 * empty directory and threw at runtime; it now rejects with a message that
 * explains itself.
 *
 * The only caller is the Quizlet URL import, which has never worked here.
 */
export const importIntegration = (path: string): Promise<never> =>
  Promise.reject(
    new Error(
      `@studyapp/integrations is not part of this fork, so "${path}" cannot be loaded.`,
    ),
  );
