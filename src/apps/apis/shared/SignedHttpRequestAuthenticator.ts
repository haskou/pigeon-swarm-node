import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { Request } from 'express';

import { InvalidSignedRequestError } from './errors/InvalidSignedRequestError';
import { SignedHttpRequestVerifier } from './SignedHttpRequestVerifier';
import { SignedRequestNonceDocument } from './SignedRequestNonceDocument';

export class SignedHttpRequestAuthenticator {
  private static readonly COLLECTION = 'signed_request_nonces';
  private static readonly MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
  private readonly verifier = new SignedHttpRequestVerifier();

  constructor(private readonly mongo: MongoDB) {}

  private async collection() {
    return this.mongo.getCollection<SignedRequestNonceDocument>(
      SignedHttpRequestAuthenticator.COLLECTION,
    );
  }

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
    const collection = await this.collection();
    const id = `${identityId.valueOf()}:${nonce}`;
    const existing = await collection.findOne({ _id: id });

    if (existing) {
      throw new InvalidSignedRequestError();
    }

    await collection.insertOne({
      _id: id,
      createdAt: Date.now(),
      identityId: identityId.valueOf(),
      nonce,
    });
  }

  public async authenticate(request: Request): Promise<IdentityId> {
    const { identityId, nonce, timestamp } =
      this.verifier.verifySignature(request);

    this.assertTimestampIsFresh(timestamp);
    await this.assertNonceHasNotBeenUsed(identityId, nonce);

    return identityId;
  }
}
