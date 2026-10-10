import { Readable } from 'stream';

import { PrivateBlobNotFoundError } from '../domain/errors/PrivateBlobNotFoundError';
import { PrivateBlobUploadClosedError } from '../domain/errors/PrivateBlobUploadClosedError';
import { PrivateBlobUploadInProgressError } from '../domain/errors/PrivateBlobUploadInProgressError';
import PrivateBlobBytesStore from '../domain/repositories/PrivateBlobBytesStore';
import PrivateBlobRepository from '../domain/repositories/PrivateBlobRepository';

export default class PrivateBlobUploader {
  private readonly inProgress = new Set<string>();

  constructor(
    private readonly repository: PrivateBlobRepository,
    private readonly bytes: PrivateBlobBytesStore,
  ) {}

  public async upload(
    blobId: string,
    uploadToken: string,
    source: Readable,
  ): Promise<void> {
    const blob = await this.repository.findById(blobId);

    if (
      !blob ||
      blob.isExpired(Date.now()) ||
      !blob.acceptsUpload(uploadToken)
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
      await this.bytes.write(blobId, source, blob.getSize());
      blob.markStored(Date.now());
      await this.repository.save(blob);
    } finally {
      this.inProgress.delete(blobId);
    }
  }
}
