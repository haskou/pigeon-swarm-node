import { Timestamp } from '@haskou/value-objects';
import { Readable } from 'stream';

import { PrivateBlobNotFoundError } from '../../domain/errors/PrivateBlobNotFoundError';
import { PrivateBlobByteRange } from '../../domain/PrivateBlobByteRange';
import PrivateBlobBytesStore from '../../domain/repositories/PrivateBlobBytesStore';
import PrivateBlobRepository from '../../domain/repositories/PrivateBlobRepository';
import { PrivateBlobReadMessage } from './messages/PrivateBlobReadMessage';

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
    message: PrivateBlobReadMessage,
  ): Promise<PrivateBlobDownload> {
    const blob = await this.repository.requireById(message.blobId);

    if (
      blob.isExpired(Timestamp.now()) ||
      !blob.acceptsDownload(message.downloadToken)
    ) {
      throw new PrivateBlobNotFoundError();
    }

    const size = blob.getSize().valueOf();
    const range = message.rangeRequest
      ? PrivateBlobByteRange.resolve(message.rangeRequest, size)
      : undefined;

    return { range, size, stream: this.bytes.read(message.blobId, range) };
  }
}
