import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import FixedWindowCounter from '@app/shared/infrastructure/local-db/FixedWindowCounter';

import IdentityAdmissionLoadRepository from '../../domain/repositories/IdentityAdmissionLoadRepository';
import { IdentityAdmissionDifficulty } from '../../domain/value-objects/IdentityAdmissionDifficulty';

export default class LocalIdentityAdmissionLoadRepository extends IdentityAdmissionLoadRepository {
  private static readonly WINDOW_MS = 60_000;
  /** Any version of an identity stays fresh for at most twice the horizon after it is first seen. */
  private static readonly SIGHTING_RETENTION_MS =
    2 * IdentityAdmissionDifficulty.FRESHNESS_HORIZON_MS;

  public static readonly NAMESPACE = 'identity_admission_load';
  public static readonly OBSERVED_NAMESPACE = 'identity_admission_observed';
  /**
   * Records waiting behind the serialized writer. Beyond it, sightings are
   * dropped uncounted, so a replication burst cannot grow memory without bound.
   */
  public static readonly MAX_PENDING_RECORDS = 1024;

  private pending: Promise<void> = Promise.resolve();
  private queuedRecords = 0;
  private lastPrunedAt: number | undefined;

  constructor(private readonly database: EmbeddedLocalDatabase) {
    super();
  }

  private async countOnce(
    identityId: IdentityId,
    networkId: NetworkId,
    now: number,
  ): Promise<void> {
    const namespace = LocalIdentityAdmissionLoadRepository.OBSERVED_NAMESPACE;
    const sightingId = `${networkId.valueOf()}:${identityId.valueOf()}`;
    const sighting = await this.database.findOne(namespace, sightingId);

    if (typeof sighting?.expiresAt === 'number' && sighting.expiresAt > now) {
      return;
    }

    if (
      (await this.countRecent(networkId)) >=
      IdentityAdmissionDifficulty.SATURATING_ADMISSIONS_PER_WINDOW
    ) {
      return;
    }

    await this.database.save(namespace, sightingId, {
      expiresAt:
        now + LocalIdentityAdmissionLoadRepository.SIGHTING_RETENTION_MS,
    });
    await FixedWindowCounter.increment(
      this.database,
      LocalIdentityAdmissionLoadRepository.NAMESPACE,
      networkId.valueOf(),
      LocalIdentityAdmissionLoadRepository.WINDOW_MS,
    );
  }

  private async pruneExpired(now: number): Promise<void> {
    if (
      this.lastPrunedAt !== undefined &&
      now - this.lastPrunedAt < LocalIdentityAdmissionLoadRepository.WINDOW_MS
    ) {
      return;
    }

    this.lastPrunedAt = now;
    await this.database.deleteMany(
      LocalIdentityAdmissionLoadRepository.OBSERVED_NAMESPACE,
      (document) =>
        typeof document.expiresAt !== 'number' || document.expiresAt <= now,
    );
    await FixedWindowCounter.deleteExpired(
      this.database,
      LocalIdentityAdmissionLoadRepository.NAMESPACE,
    );
  }

  public async countRecent(networkId: NetworkId): Promise<number> {
    return FixedWindowCounter.count(
      this.database,
      LocalIdentityAdmissionLoadRepository.NAMESPACE,
      networkId.valueOf(),
    );
  }

  /**
   * Serialized so concurrent sightings of one identity cannot both miss the
   * dedupe check and counter updates cannot interleave.
   */
  public record(
    identityId: IdentityId,
    networkIds: NetworkId[],
  ): Promise<void> {
    if (
      this.queuedRecords >=
      LocalIdentityAdmissionLoadRepository.MAX_PENDING_RECORDS
    ) {
      return Promise.resolve();
    }

    this.queuedRecords += 1;
    const recorded = this.pending
      .then(async () => {
        const now = Date.now();

        await this.pruneExpired(now);
        for (const networkId of networkIds) {
          await this.countOnce(identityId, networkId, now);
        }
      })
      .finally(() => {
        this.queuedRecords -= 1;
      });

    this.pending = recorded.catch((): void => undefined);

    return recorded;
  }
}
