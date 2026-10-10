import { Readable } from 'stream';

import { PrivateBlobNotFoundError } from '../domain/errors/PrivateBlobNotFoundError';
import { PrivateBlobByteRange } from '../domain/PrivateBlobByteRange';
import { PrivateBlobRange } from '../domain/PrivateBlobRange';
import PrivateBlobBytesStore from '../domain/repositories/PrivateBlobBytesStore';
import PrivateBlobRepository from '../domain/repositories/PrivateBlobRepository';

export interface PrivateBlobDownload {
  range?: PrivateBlobByteRange;
  size: number;
  stream: Readable;
}

export default class PrivateBlobReader {
  constructor(
    private readonly repository: PrivateBlobRepository,
    private readonly bytes: PrivateBlobBytesStore,
  ) {}

  public async open(
    blobId: string,
    downloadToken: string,
    rangeHeader?: string,
  ): Promise<PrivateBlobDownload> {
    const blob = await this.repository.findById(blobId);

    if (
      !blob ||
      blob.isExpired(Date.now()) ||
      !blob.acceptsDownload(downloadToken)
    ) {
      throw new PrivateBlobNotFoundError();
    }

    const size = blob.getSize();
    const range = PrivateBlobRange.resolve(rangeHeader, size);

    return { range, size, stream: this.bytes.read(blobId, range) };
  }
}
