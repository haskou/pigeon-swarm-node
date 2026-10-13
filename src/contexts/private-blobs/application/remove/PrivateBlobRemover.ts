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
    const blob = await this.repository.requireById(message.blobId);

    if (!blob.acceptsUpload(message.uploadToken)) {
      throw new PrivateBlobNotFoundError();
    }

    await this.bytes.delete(message.blobId);
    await this.repository.delete(message.blobId);
  }
}
