import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { DeviceSealingViewResource } from './resources/DeviceSealingViewResource';

type Entry = { expiresAt: number; resource: DeviceSealingViewResource };

/**
 * Keeps a served sealing view for a few seconds, so a flood of anonymous reads
 * of one identity costs one lookup and spends no per-target or node budget.
 * Successes only; bounded, the oldest entry leaves first.
 */
export default class DeviceSealingViewCache {
  public static readonly TTL_MS = 5_000;
  public static readonly MAX_ENTRIES = 1_000;
  private readonly entries = new Map<string, Entry>();

  public find(
    target: IdentityId,
    now = Date.now(),
  ): DeviceSealingViewResource | undefined {
    const entry = this.entries.get(target.valueOf());

    if (!entry || entry.expiresAt <= now) {
      this.entries.delete(target.valueOf());

      return undefined;
    }

    return entry.resource;
  }

  public store(
    target: IdentityId,
    resource: DeviceSealingViewResource,
    now = Date.now(),
  ): void {
    this.entries.delete(target.valueOf());

    if (this.entries.size >= DeviceSealingViewCache.MAX_ENTRIES) {
      const oldest = this.entries.keys().next();

      if (!oldest.done) {
        this.entries.delete(oldest.value);
      }
    }

    this.entries.set(target.valueOf(), {
      expiresAt: now + DeviceSealingViewCache.TTL_MS,
      resource,
    });
  }
}
