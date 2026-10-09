import { PublicMutationExpectation } from './PublicMutationVerifier';

/** What a governed collection requires from each of its records. */
export abstract class PublicMutationPolicy {
  public abstract readonly collection: string;

  /** Value of the record's `scopeType` that this policy governs. */
  public abstract readonly scopeType: string;

  /**
   * Whether the proof must carry the causal frontier of the record's scope.
   * Scoped policies judge permission against the scope folded at that frontier.
   */
  public readonly requiresFrontier: boolean = false;

  /** Throws when the record is malformed or its scope/author is inconsistent. */
  public abstract expectationOf(
    record: Record<string, unknown>,
  ): Omit<PublicMutationExpectation, 'payload'>;

  /** Throws when the author lacks the permission to author this mutation. */
  public abstract assertPermitted(
    record: Record<string, unknown>,
    authorIdentityId: string,
    isDeletion: boolean,
    frontier: string[],
  ): Promise<void>;
}
