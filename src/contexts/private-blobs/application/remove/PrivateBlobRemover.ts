import { PrivateBlobNotFoundError } from '../domain/errors/PrivateBlobNotFoundError';
import PrivateBlobBytesStore from '../domain/repositories/PrivateBlobBytesStore';
import PrivateBlobRepository from '../domain/repositories/PrivateBlobRepository';

export default class PrivateBlobRemover {
  constructor(
    private readonly repository: PrivateBlobRepository,
    private readonly bytes: PrivateBlobBytesStore,
  ) {}

  /** Bytes go first: a crash leaves a record that expiry cleans, never an orphan file. */
  public async remove(blobId: string, uploadToken: string): Promise<void> {
    const blob = await this.repository.findById(blobId);

    if (!blob || !blob.acceptsUpload(uploadToken)) {
      throw new PrivateBlobNotFoundError();
    }

    await this.bytes.delete(blobId);
    await this.repository.delete(blobId);
  }
}
