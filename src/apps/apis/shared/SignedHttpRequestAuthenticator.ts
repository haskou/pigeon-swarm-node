import NodeBlockPolicy from '@app/contexts/nodes/domain/services/NodeBlockPolicy';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature } from '@haskou/pigeon-swarm-crypto';
import { Request } from 'express';

import { IdentityIsBlockedOnThisNodeError } from './errors/IdentityIsBlockedOnThisNodeError';
import { InvalidSignedRequestError } from './errors/InvalidSignedRequestError';
import { SignedHttpRequestVerifier } from './SignedHttpRequestVerifier';
import { SignedRequestBodyHash } from './SignedRequestBodyHash';
import { assertSignedRequestTimestampIsFresh } from './SignedRequestFreshness';
import { signedRequestReplayGuard } from './SignedRequestReplayGuard';

export default class SignedHttpRequestAuthenticator {
  private static readonly SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
  private readonly verifier = new SignedHttpRequestVerifier();

  constructor(private readonly blockPolicy: NodeBlockPolicy) {}

  private assertIsNotReplayed(
    request: Request,
    identityId: IdentityId,
    signature: Signature,
  ): void {
    if (
      SignedHttpRequestAuthenticator.SAFE_METHODS.has(
        request.method.toUpperCase(),
      )
    ) {
      return;
    }

    if (!signedRequestReplayGuard.accept(identityId, signature)) {
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
    this.assertIsNotReplayed(request, identityId, signature);
    await this.assertIsNotBlocked(identityId);
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

  public async assertIsNotBlocked(identityId: IdentityId): Promise<void> {
    if (await this.blockPolicy.isIdentityBlocked(identityId)) {
      throw new IdentityIsBlockedOnThisNodeError();
    }
  }
}
