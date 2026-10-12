import { Timestamp } from '@haskou/value-objects';

import PrivateBlobPolicy from '../domain/PrivateBlobPolicy';
import PrivateBlobBytesStore from '../domain/repositories/PrivateBlobBytesStore';
import PrivateBlobRepository from '../domain/repositories/PrivateBlobRepository';

/** Retention, abandoned-upload cleanup and removal of orphaned bytes. */
export default class PrivateBlobExpirer {
  constructor(
    private readonly repository: PrivateBlobRepository,
    private readonly bytes: PrivateBlobBytesStore,
    private readonly policy: PrivateBlobPolicy,
  ) {}

  private async findOrphanIds(): Promise<string[]> {
    const orphans: string[] = [];

    for (const id of await this.bytes.listIds()) {
      if (!(await this.repository.findById(id))) {
        orphans.push(id);
      }
    }

    return orphans;
  }

  /**
   * Extends stored blobs recorded under a shorter retention than the current
   * floor (older records, or a lowered setting). Returns how many could not be
   * extended; the next sweep retries them.
   */
  private async alignRetention(): Promise<number> {
    const floorMs = this.policy.retentionMs();
    const stale = await this.repository.findStoredRetainedBelow(floorMs);
    let failed = 0;

    for (const blob of stale) {
      try {
        blob.extendRetentionTo(floorMs);
        await this.repository.save(blob);
      } catch {
        failed += 1;
      }
    }

    return failed;
  }

  /**
   * Returns the number of records removed. One failing blob never stops the
   * sweep: its record stays so the next sweep retries it, and the failure
   * count is reported after the rest ran.
   *
   * Bytes without a record never expire on their own: a restore can bring
   * files back without their records, and an upload that lands after the
   * expirer removed its record leaves a file behind. Those are removed here.
   */
  public async expire(now: Timestamp): Promise<number> {
    const alignmentFailed = await this.alignRetention();
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

    if (failed > 0 || orphansFailed > 0 || alignmentFailed > 0) {
      throw new Error(
        `Private blob expiration failed for ${failed} of ${expired.length} blobs, ${orphansFailed} orphaned files and ${alignmentFailed} retention extensions; ${removed} removed.`,
      );
    }

    return removed;
  }
}
