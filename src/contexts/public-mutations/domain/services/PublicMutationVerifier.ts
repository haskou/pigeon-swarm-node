import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { InvalidPublicMutationError } from '../errors/InvalidPublicMutationError';
import { PublicMutationProof } from '../PublicMutationProof';
import { PublicMutationAuthorAuthorization } from './PublicMutationAuthorAuthorization';

export interface PublicMutationExpectation {
  store: string;
  recordId: string;
  /** Immutable fields of the record that the proof must commit to. */
  payload: Record<string, unknown>;
  /** Identity that is allowed to author this record, when it is fixed. */
  authorIdentityId?: string;
}

export default class PublicMutationVerifier {
  public constructor(
    private readonly authorization: PublicMutationAuthorAuthorization,
  ) {}

  private assertBoundTo(
    proof: PublicMutationProof,
    expectation: PublicMutationExpectation,
  ): void {
    const body = proof.getBody();
    const author = proof.getAuthor();
    const sameScope =
      body.store === expectation.store &&
      body.recordId === expectation.recordId;
    const sameAuthor =
      expectation.authorIdentityId === undefined ||
      author.identityId === expectation.authorIdentityId;

    if (
      !sameScope ||
      !sameAuthor ||
      body.payloadDigest !== PublicMutationProof.digestOf(expectation.payload)
    ) {
      throw new InvalidPublicMutationError();
    }
  }

  private isSignedByDevice(proof: PublicMutationProof): boolean {
    try {
      return new IdentityId(
        proof.getAuthor().deviceCredential,
      ).isValidSignature(proof.signingContent(), proof.getSignature());
    } catch {
      return false;
    }
  }

  /** Structural checks: a proof that fails them can never be valid. */
  public assertIntrinsic(
    proof: PublicMutationProof,
    expectation: PublicMutationExpectation,
  ): void {
    this.assertBoundTo(proof, expectation);

    if (!this.isSignedByDevice(proof)) {
      throw new InvalidPublicMutationError();
    }
  }

  /**
   * State-dependent check. A revision the local chain has not reached is held
   * (the authorization port rejects with a pending error); a device that was
   * not authorized at the revision it signed is refused.
   */
  public async assertAuthorized(proof: PublicMutationProof): Promise<void> {
    if (!(await this.authorization.isAuthorized(proof.getAuthor()))) {
      throw new InvalidPublicMutationError();
    }
  }

  /**
   * Fails closed: wrong scope, wrong payload, wrong signature, a device that
   * is not authorized for the identity, or an unexpected author all throw.
   */
  public async verify(
    proof: PublicMutationProof,
    expectation: PublicMutationExpectation,
  ): Promise<void> {
    this.assertIntrinsic(proof, expectation);
    await this.assertAuthorized(proof);
  }
}
