import { PublicMutationAuthorPrimitives } from '../PublicMutationAuthorPrimitives';

/**
 * Resolves whether a device was authorized to speak for an identity at the
 * authorization revision its proof claims. Rejects with
 * `PublicMutationPendingError` while that revision, or the identity's chain,
 * has not replicated yet.
 */
export abstract class PublicMutationAuthorAuthorization {
  public abstract isAuthorized(
    author: PublicMutationAuthorPrimitives,
  ): Promise<boolean>;
}
