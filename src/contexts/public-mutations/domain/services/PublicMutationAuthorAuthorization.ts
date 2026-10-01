import { PublicMutationAuthorPrimitives } from '../PublicMutationProofPrimitives';

/** Resolves whether a device was authorized to speak for an identity. */
export abstract class PublicMutationAuthorAuthorization {
  public abstract isAuthorized(
    author: PublicMutationAuthorPrimitives,
  ): Promise<boolean>;
}
