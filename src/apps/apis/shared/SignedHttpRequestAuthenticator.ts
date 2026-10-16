import NodeBlockPolicy from '@app/contexts/nodes/domain/services/NodeBlockPolicy';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature } from '@haskou/pigeon-swarm-crypto';
import { Request } from 'express';

import { IdentityIsBlockedOnThisNodeError } from './errors/IdentityIsBlockedOnThisNodeError';
import { InvalidSignedRequestError } from './errors/InvalidSignedRequestError';
import { SignedHttpRequestVerifier } from './SignedHttpRequestVerifier';
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

  /** Verifies the request signature and refuses identities blocked on this node (403012). */
  public async authenticate(request: Request): Promise<IdentityId> {
    const { identityId, signature, timestamp } =
      this.verifier.verifySignature(request);

    assertSignedRequestTimestampIsFresh(timestamp);
    this.assertIsNotReplayed(request, identityId, signature);
    await this.assertIsNotBlocked(identityId);

    return identityId;
  }

  public async assertIsNotBlocked(identityId: IdentityId): Promise<void> {
    if (await this.blockPolicy.isIdentityBlocked(identityId)) {
      throw new IdentityIsBlockedOnThisNodeError();
    }
  }
}
