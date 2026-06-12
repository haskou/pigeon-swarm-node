import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Request } from 'express';

import { InvalidSignedRequestError } from './errors/InvalidSignedRequestError';
import { SignedHttpRequestVerifier } from './SignedHttpRequestVerifier';

export default class SignedHttpRequestAuthenticator {
  private static readonly MAX_CLOCK_SKEW_MS = 30 * 1000;
  private readonly verifier = new SignedHttpRequestVerifier();

  private assertTimestampIsFresh(timestamp: string): void {
    const parsedTimestamp = Number(timestamp);
    const now = Date.now();

    if (
      !Number.isInteger(parsedTimestamp) ||
      Math.abs(now - parsedTimestamp) >
        SignedHttpRequestAuthenticator.MAX_CLOCK_SKEW_MS
    ) {
      throw new InvalidSignedRequestError();
    }
  }

  public authenticate(request: Request): IdentityId {
    const { identityId, timestamp } = this.verifier.verifySignature(request);

    this.assertTimestampIsFresh(timestamp);

    return identityId;
  }
}
