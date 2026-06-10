import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { Request } from 'express';

import { InvalidSignedRequestError } from './errors/InvalidSignedRequestError';
import { SignedHttpRequestVerifier } from './SignedHttpRequestVerifier';

export default class SignedHttpRequestAuthenticator {
  private static readonly NAMESPACE = 'signed_request_nonces';
  private static readonly MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
  private readonly verifier = new SignedHttpRequestVerifier();

  constructor(private readonly database: EmbeddedLocalDatabase) {}

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

  private async assertNonceHasNotBeenUsed(
    identityId: IdentityId,
    nonce: string,
  ): Promise<void> {
    const id = `${identityId.valueOf()}:${nonce}`;
    const existing = await this.database.findOne(
      SignedHttpRequestAuthenticator.NAMESPACE,
      id,
    );

    if (existing) {
      throw new InvalidSignedRequestError();
    }

    await this.database.save(SignedHttpRequestAuthenticator.NAMESPACE, id, {
      createdAt: Date.now(),
      identityId: identityId.valueOf(),
      nonce,
    });
  }

  private async deleteExpiredNonces(): Promise<void> {
    const threshold =
      Date.now() - SignedHttpRequestAuthenticator.MAX_CLOCK_SKEW_MS;

    await this.database.deleteMany(
      SignedHttpRequestAuthenticator.NAMESPACE,
      (document) =>
        typeof document.createdAt === 'number' &&
        document.createdAt < threshold,
    );
  }

  public async authenticate(request: Request): Promise<IdentityId> {
    const { identityId, nonce, timestamp } =
      this.verifier.verifySignature(request);

    this.assertTimestampIsFresh(timestamp);
    await this.deleteExpiredNonces();
    await this.assertNonceHasNotBeenUsed(identityId, nonce);

    return identityId;
  }
}
