import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Request } from 'express';

import { InvalidSignedRequestError } from './errors/InvalidSignedRequestError';
import { SignedHttpRequestVerifier } from './SignedHttpRequestVerifier';
import { assertSignedRequestTimestampIsFresh } from './SignedRequestFreshness';
import { signedRequestReplayGuard } from './SignedRequestReplayGuard';

export default class SignedHttpRequestAuthenticator {
  private static readonly SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
  private readonly verifier = new SignedHttpRequestVerifier();

  private assertIsNotReplayed(request: Request, identityId: IdentityId): void {
    if (
      SignedHttpRequestAuthenticator.SAFE_METHODS.has(
        request.method.toUpperCase(),
      )
    ) {
      return;
    }

    const signature = this.verifier.getRequiredHeader(request, 'x-signature');

    if (!signedRequestReplayGuard.accept(identityId.toString(), signature)) {
      throw new InvalidSignedRequestError();
    }
  }

  public authenticate(request: Request): IdentityId {
    const { identityId, timestamp } = this.verifier.verifySignature(request);

    assertSignedRequestTimestampIsFresh(timestamp);
    this.assertIsNotReplayed(request, identityId);

    return identityId;
  }
}
