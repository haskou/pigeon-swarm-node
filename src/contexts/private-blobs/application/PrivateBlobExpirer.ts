import PrivateBlobBytesStore from '../domain/repositories/PrivateBlobBytesStore';
import PrivateBlobRepository from '../domain/repositories/PrivateBlobRepository';

/** Retention and abandoned-upload cleanup. */
export default class PrivateBlobExpirer {
  constructor(
    private readonly repository: PrivateBlobRepository,
    private readonly bytes: PrivateBlobBytesStore,
  ) {}

  public async expire(now: number): Promise<number> {
    const expired = await this.repository.findExpired(now);

    for (const blob of expired) {
      await this.bytes.delete(blob.getId());
      await this.repository.delete(blob.getId());
    }

    return expired.length;
  }
}
