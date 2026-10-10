import PrivateBlobBytesStore from '../domain/repositories/PrivateBlobBytesStore';
import PrivateBlobRepository from '../domain/repositories/PrivateBlobRepository';

/** Retention and abandoned-upload cleanup. */
export default class PrivateBlobExpirer {
  constructor(
    private readonly repository: PrivateBlobRepository,
    private readonly bytes: PrivateBlobBytesStore,
  ) {}

  /**
   * One failing blob never stops the sweep: its record stays so the next
   * sweep retries it, and the failure count is reported after the rest ran.
   */
  public async expire(now: number): Promise<number> {
    const expired = await this.repository.findExpired(now);
    let removed = 0;
    let failed = 0;

    for (const blob of expired) {
      try {
        await this.bytes.delete(blob.getId());
        await this.repository.delete(blob.getId());
        removed += 1;
      } catch {
        failed += 1;
      }
    }

    if (failed > 0) {
      throw new Error(
        `Private blob expiration failed for ${failed} of ${expired.length} blobs; ${removed} removed.`,
      );
    }

    return removed;
  }
}
