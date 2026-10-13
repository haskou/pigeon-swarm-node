import { PrivateBlobNotFoundError } from '../../domain/errors/PrivateBlobNotFoundError';
import PrivateBlobBytesStore from '../../domain/repositories/PrivateBlobBytesStore';
import PrivateBlobRepository from '../../domain/repositories/PrivateBlobRepository';
import { PrivateBlobRemoveMessage } from './messages/PrivateBlobRemoveMessage';

export default class PrivateBlobRemover {
  constructor(
    private readonly repository: PrivateBlobRepository,
    private readonly bytes: PrivateBlobBytesStore,
  ) {}

  /** Bytes go first: a crash leaves a record that expiry cleans, never an orphan file. */
  public async remove(message: PrivateBlobRemoveMessage): Promise<void> {
    const blobId = message.blobId.valueOf();
    const blob = await this.repository.requireById(blobId);

    if (!blob.acceptsUpload(message.uploadToken.valueOf())) {
      throw new PrivateBlobNotFoundError();
    }

    await this.bytes.delete(blobId);
    await this.repository.delete(blobId);
  }
}
