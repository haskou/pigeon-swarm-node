import { PublicMutationExpectation } from './PublicMutationVerifier';

/** What a governed collection requires from each of its records. */
export abstract class PublicMutationPolicy {
  public abstract readonly collection: string;

  /** Value of the record's `scopeType` that this policy governs. */
  public abstract readonly scopeType: string;

  /** Throws when the record is malformed or its scope/author is inconsistent. */
  public abstract expectationOf(
    record: Record<string, unknown>,
  ): Omit<PublicMutationExpectation, 'payload'>;

  /** Throws when the author lacks the permission to author this mutation. */
  public abstract assertPermitted(
    record: Record<string, unknown>,
    authorIdentityId: string,
    isDeletion: boolean,
  ): Promise<void>;
}
