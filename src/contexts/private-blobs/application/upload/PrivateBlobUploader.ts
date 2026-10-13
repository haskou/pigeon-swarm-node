import { Timestamp } from '@haskou/value-objects';

import { PrivateBlobNotFoundError } from '../../domain/errors/PrivateBlobNotFoundError';
import { PrivateBlobUploadClosedError } from '../../domain/errors/PrivateBlobUploadClosedError';
import { PrivateBlobUploadInProgressError } from '../../domain/errors/PrivateBlobUploadInProgressError';
import PrivateBlobBytesStore from '../../domain/repositories/PrivateBlobBytesStore';
import PrivateBlobRepository from '../../domain/repositories/PrivateBlobRepository';
import { PrivateBlobUploadMessage } from './messages/PrivateBlobUploadMessage';

export default class PrivateBlobUploader {
  private readonly inProgress = new Set<string>();

  constructor(
    private readonly repository: PrivateBlobRepository,
    private readonly bytes: PrivateBlobBytesStore,
  ) {}

  public async upload(message: PrivateBlobUploadMessage): Promise<void> {
    const blobId = message.blobId.valueOf();
    const blob = await this.repository.findById(blobId);

    if (
      !blob ||
      blob.isExpired(Timestamp.now()) ||
      !blob.acceptsUpload(message.uploadToken.valueOf())
    ) {
      throw new PrivateBlobNotFoundError();
    }

    if (blob.isStored()) {
      throw new PrivateBlobUploadClosedError();
    }

    if (this.inProgress.has(blobId)) {
      throw new PrivateBlobUploadInProgressError();
    }

    this.inProgress.add(blobId);

    try {
      await this.bytes.write(blobId, message.source, blob.getSize());
      blob.markStored(Timestamp.now());
      await this.repository.save(blob);
    } finally {
      this.inProgress.delete(blobId);
    }
  }
}
