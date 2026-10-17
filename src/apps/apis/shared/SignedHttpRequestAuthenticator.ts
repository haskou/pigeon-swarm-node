import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import NodeBlockPolicy from '@app/contexts/nodes/domain/services/NodeBlockPolicy';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature } from '@haskou/pigeon-swarm-crypto';
import { Request } from 'express';

import { IdentityIsBlockedOnThisNodeError } from './errors/IdentityIsBlockedOnThisNodeError';
import { InvalidSignedRequestError } from './errors/InvalidSignedRequestError';
import { NonCanonicalIdentityIdError } from './errors/NonCanonicalIdentityIdError';
import { SignedHttpRequestVerifier } from './SignedHttpRequestVerifier';
import { SignedRequestBodyHash } from './SignedRequestBodyHash';
import { assertSignedRequestTimestampIsFresh } from './SignedRequestFreshness';
import { signedRequestReplayGuard } from './SignedRequestReplayGuard';

export default class SignedHttpRequestAuthenticator {
  private static readonly SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
  private readonly verifier = new SignedHttpRequestVerifier();

  constructor(
    private readonly blockPolicy: NodeBlockPolicy,
    private readonly identityRepository: IdentityRepository,
  ) {}

  /**
   * Records a state-changing request once, after every other check passed. An
   * identity this node does not hold, such as one creating itself here, only
   * gets a slot in the share of the replay guard kept for strangers.
   */
  private async assertIsNotReplayed(
    request: Request,
    identityId: IdentityId,
    signature: Signature,
  ): Promise<void> {
    if (
      SignedHttpRequestAuthenticator.SAFE_METHODS.has(
        request.method.toUpperCase(),
      )
    ) {
      return;
    }

    const accepted = (await this.identityRepository.holds(identityId))
      ? signedRequestReplayGuard.accept(identityId, signature)
      : signedRequestReplayGuard.acceptFromStranger(identityId, signature);

    if (!accepted) {
      throw new InvalidSignedRequestError();
    }
  }

  private async admit(
    request: Request,
    identityId: IdentityId,
    signature: Signature,
    timestamp: string,
  ): Promise<void> {
    assertSignedRequestTimestampIsFresh(timestamp);
    await this.assertIsNotBlocked(identityId);
    await this.assertIsNotReplayed(request, identityId, signature);
  }

  /** Verifies the request signature and refuses identities blocked on this node (403012). */
  public async authenticate(request: Request): Promise<IdentityId> {
    const { identityId, signature, timestamp } =
      this.verifier.verifySignature(request);

    await this.admit(request, identityId, signature, timestamp);

    return identityId;
  }

  /**
   * Authenticates a request from its headers alone: the signature covers the
   * declared `X-Body-Hash` instead of the body, so no body byte is read. The
   * caller must only accept a body that matches the returned hash.
   */
  public async authenticateDeclaredBody(
    request: Request,
  ): Promise<{ bodyHash: SignedRequestBodyHash; identityId: IdentityId }> {
    const { bodyHash, identityId, signature, timestamp } =
      this.verifier.verifyDeclaredBodySignature(request);

    await this.admit(request, identityId, signature, timestamp);

    return { bodyHash, identityId };
  }

  /**
   * Refuses an identity blocked on this node (403012). Block entries hold
   * canonical ids compared as strings, so an alias encoding of a blocked key
   * would never match its entry: an id that is not the canonical encoding of a
   * usable key is refused first (400080), before the block list is read.
   */
  public async assertIsNotBlocked(identityId: IdentityId): Promise<void> {
    if (!identityId.isCanonicalKey()) {
      throw new NonCanonicalIdentityIdError();
    }

    if (await this.blockPolicy.isIdentityBlocked(identityId)) {
      throw new IdentityIsBlockedOnThisNodeError();
    }
  }
}
