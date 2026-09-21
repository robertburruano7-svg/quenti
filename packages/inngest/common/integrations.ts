/**
 * See packages/trpc/integrations.ts. The integrations package is private
 * upstream and absent from this fork.
 */
export const importIntegration = (path: string): Promise<never> =>
  Promise.reject(
    new Error(
      `@studyapp/integrations is not part of this fork, so "${path}" cannot be loaded.`,
    ),
  );
