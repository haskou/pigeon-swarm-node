import { PublicMutationExpectation } from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';

/** Which stored records belong to one author, and how many may be admitted. */
export interface GenuineRecordQuotaRule {
  /** The payload field that names the author of a record of this kind. */
  authorField: string;
  expectationOf: (
    payload: Record<string, unknown>,
  ) => Omit<PublicMutationExpectation, 'payload'>;
  limit: number;
  scopeType: string;
}
