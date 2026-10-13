import { Timestamp } from '@haskou/value-objects';

import { PrivateBlob } from '../../domain/PrivateBlob';
import PrivateBlobPolicy from '../../domain/PrivateBlobPolicy';
import PrivateBlobRepository from '../../domain/repositories/PrivateBlobRepository';
import { PrivateBlobReserveMessage } from './messages/PrivateBlobReserveMessage';

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
    message: PrivateBlobReserveMessage,
  ): Promise<PrivateBlobReservation> {
    this.policy.assertSizeAllowed(message.size);

    const now = Timestamp.now();
    const ownerKey = await this.repository.ownerKeyFor(
      message.ownerIdentityId.valueOf(),
    );
    const [total, owned] = await Promise.all([
      this.repository.reservedBytes(now),
      this.repository.reservedBytes(now, ownerKey),
    ]);

    this.policy.assertQuotaAllowed(message.size, total, owned);

    const { blob, downloadToken, uploadToken } = PrivateBlob.reserve({
      now,
      ownerKey,
      retentionMs: this.policy.retentionMs(),
      size: message.size,
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
    message: PrivateBlobReserveMessage,
  ): Promise<PrivateBlobReservation> {
    const result = this.queue.then((): Promise<PrivateBlobReservation> =>
      this.reserveNow(message),
    );

    this.queue = result.catch((): void => undefined);

    return result;
  }
}
