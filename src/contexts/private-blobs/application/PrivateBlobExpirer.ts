import PrivateBlobBytesStore from '../domain/repositories/PrivateBlobBytesStore';
import PrivateBlobRepository from '../domain/repositories/PrivateBlobRepository';

/** Retention, abandoned-upload cleanup and removal of orphaned bytes. */
export default class PrivateBlobExpirer {
  constructor(
    private readonly repository: PrivateBlobRepository,
    private readonly bytes: PrivateBlobBytesStore,
  ) {}

  /**
   * Returns the number of records removed. One failing blob never stops the
   * sweep: its record stays so the next sweep retries it, and the failure
   * count is reported after the rest ran.
   *
   * Bytes without a record never expire on their own: a restore can bring
   * files back without their records, and an upload that lands after the
   * expirer removed its record leaves a file behind. Those are removed here.
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

    let orphansFailed = 0;

    for (const id of await this.findOrphanIds()) {
      try {
        await this.bytes.delete(id);
      } catch {
        orphansFailed += 1;
      }
    }

    if (failed > 0 || orphansFailed > 0) {
      throw new Error(
        `Private blob expiration failed for ${failed} of ${expired.length} blobs and ${orphansFailed} orphaned files; ${removed} removed.`,
      );
    }

    return removed;
  }

  private async findOrphanIds(): Promise<string[]> {
    const orphans: string[] = [];

    for (const id of await this.bytes.listIds()) {
      if (!(await this.repository.findById(id))) {
        orphans.push(id);
      }
    }

    return orphans;
  }
}
