import PrivateBlobBytesStore from '@app/contexts/private-blobs/domain/repositories/PrivateBlobBytesStore';

/** Refuses to start, before any request is served, when private blob bytes cannot be written. */
export default class PrivateBlobStorageInitializer {
  constructor(private readonly bytes: PrivateBlobBytesStore) {}

  public ensure(): Promise<void> {
    return this.bytes.ensureWritable();
  }
}
