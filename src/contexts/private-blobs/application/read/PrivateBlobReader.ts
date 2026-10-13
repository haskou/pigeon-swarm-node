import { Timestamp } from '@haskou/value-objects';
import { Readable } from 'stream';

import { PrivateBlobNotFoundError } from '../domain/errors/PrivateBlobNotFoundError';
import { PrivateBlobByteRange } from '../domain/PrivateBlobByteRange';
import { PrivateBlobRangeRequest } from '../domain/PrivateBlobRangeRequest';
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
    rangeRequest?: PrivateBlobRangeRequest,
  ): Promise<PrivateBlobDownload> {
    const blob = await this.repository.findById(blobId);

    if (
      !blob ||
      blob.isExpired(Timestamp.now()) ||
      !blob.acceptsDownload(downloadToken)
    ) {
      throw new PrivateBlobNotFoundError();
    }

    const size = blob.getSize();
    const range = rangeRequest
      ? PrivateBlobByteRange.resolve(rangeRequest, size)
      : undefined;

    return { range, size, stream: this.bytes.read(blobId, range) };
  }
}
