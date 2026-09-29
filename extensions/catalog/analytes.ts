/** Human-approved analyte identities and source aliases. Starts intentionally empty. */
export type Analyte = {
  id: string;
  displayName: string;
  sourceCodes: string[];
  aliases: string[];
};

/**
 * Add entries only after a human has verified the source code/label mapping.
 * Keeping this data separate from parsing logic makes mappings versionable and reviewable.
 */
export const analytes: Analyte[] = [];
