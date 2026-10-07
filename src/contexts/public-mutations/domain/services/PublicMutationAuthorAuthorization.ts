import { PublicMutationAuthorPrimitives } from '../PublicMutationAuthorPrimitives';

/**
 * Resolves whether a device was authorized to speak for an identity at the
 * authorization revision its proof claims.
 */
export abstract class PublicMutationAuthorAuthorization {
  public abstract isAuthorized(
    author: PublicMutationAuthorPrimitives,
  ): Promise<boolean>;
}
