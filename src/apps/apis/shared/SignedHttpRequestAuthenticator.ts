import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Request } from 'express';

import { InvalidSignedRequestError } from './errors/InvalidSignedRequestError';
import { SignedHttpRequestVerifier } from './SignedHttpRequestVerifier';
import {
  SignedRequestReplayGuard,
  signedRequestReplayGuard,
} from './SignedRequestReplayGuard';

export default class SignedHttpRequestAuthenticator {
  private static readonly SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
  private readonly verifier = new SignedHttpRequestVerifier();

  private assertTimestampIsFresh(timestamp: string): void {
    const parsedTimestamp = Number(timestamp);
    const now = Date.now();

    if (
      !Number.isInteger(parsedTimestamp) ||
      Math.abs(now - parsedTimestamp) >
        SignedRequestReplayGuard.MAX_CLOCK_SKEW_MS
    ) {
      throw new InvalidSignedRequestError();
    }
  }

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

    this.assertTimestampIsFresh(timestamp);
    this.assertIsNotReplayed(request, identityId);

    return identityId;
  }
}
