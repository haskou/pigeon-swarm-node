import { Timestamp } from '@haskou/value-objects';

import { PrivateBlob } from '../domain/PrivateBlob';
import PrivateBlobPolicy from '../domain/PrivateBlobPolicy';
import PrivateBlobRepository from '../domain/repositories/PrivateBlobRepository';

export interface PrivateBlobReservation {
  blobId: string;
  downloadToken: string;
  expiresAt: number;
  uploadToken: string;
}

export default class PrivateBlobReserver {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly repository: PrivateBlobRepository,
    private readonly policy: PrivateBlobPolicy,
  ) {}

  private async reserveNow(
    ownerIdentityId: string,
    size: number,
  ): Promise<PrivateBlobReservation> {
    this.policy.assertSizeAllowed(size);

    const now = Timestamp.now();
    const ownerKey = await this.repository.ownerKeyFor(ownerIdentityId);
    const [total, owned] = await Promise.all([
      this.repository.reservedBytes(now),
      this.repository.reservedBytes(now, ownerKey),
    ]);

    this.policy.assertQuotaAllowed(size, total, owned);

    const { blob, downloadToken, uploadToken } = PrivateBlob.reserve({
      now,
      ownerKey,
      retentionMs: this.policy.retentionMs(),
      size,
      uploadWindowMs: this.policy.uploadWindowMs(),
    });

    await this.repository.save(blob);

    return {
      blobId: blob.getId(),
      downloadToken,
      expiresAt: blob.getExpiresAt(),
      uploadToken,
    };
  }

  /** Serialized so concurrent reservations cannot overshoot a quota. */
  public reserve(
    ownerIdentityId: string,
    size: number,
  ): Promise<PrivateBlobReservation> {
    const result = this.queue.then((): Promise<PrivateBlobReservation> =>
      this.reserveNow(ownerIdentityId, size),
    );

    this.queue = result.catch((): void => undefined);

    return result;
  }
}
