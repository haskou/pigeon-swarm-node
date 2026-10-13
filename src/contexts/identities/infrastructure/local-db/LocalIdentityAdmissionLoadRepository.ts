import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import FixedWindowCounter from '@app/shared/infrastructure/local-db/FixedWindowCounter';

import IdentityAdmissionLoadRepository from '../../domain/repositories/IdentityAdmissionLoadRepository';
import { IdentityAdmissionDifficulty } from '../../domain/value-objects/IdentityAdmissionDifficulty';
import { IdentityExternalIdentifier } from '../../domain/value-objects/IdentityExternalIdentifier';

export default class LocalIdentityAdmissionLoadRepository extends IdentityAdmissionLoadRepository {
  private static readonly NAMESPACE = 'identity_admission_load';
  private static readonly WINDOW_MS = 60_000;
  /** A version stays fresh for at most twice the horizon after it is first seen. */
  private static readonly SIGHTING_RETENTION_MS =
    2 * IdentityAdmissionDifficulty.FRESHNESS_HORIZON_MS;

  public static readonly OBSERVED_NAMESPACE = 'identity_admission_observed';

  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly database: EmbeddedLocalDatabase) {
    super();
  }

  private async countOnce(
    externalIdentifier: IdentityExternalIdentifier,
    networkId: NetworkId,
  ): Promise<void> {
    const namespace = LocalIdentityAdmissionLoadRepository.OBSERVED_NAMESPACE;
    const now = Date.now();
    const sightingId = `${networkId.valueOf()}:${externalIdentifier.valueOf()}`;
    const sighting = await this.database.findOne(namespace, sightingId);

    if (typeof sighting?.expiresAt === 'number' && sighting.expiresAt > now) {
      return;
    }

    await this.database.save(namespace, sightingId, {
      expiresAt:
        now + LocalIdentityAdmissionLoadRepository.SIGHTING_RETENTION_MS,
    });
    const count = await FixedWindowCounter.increment(
      this.database,
      LocalIdentityAdmissionLoadRepository.NAMESPACE,
      networkId.valueOf(),
      LocalIdentityAdmissionLoadRepository.WINDOW_MS,
    );

    if (count === 1) {
      await this.database.deleteMany(
        namespace,
        (document) =>
          typeof document.expiresAt !== 'number' || document.expiresAt <= now,
      );
    }
  }

  public async countRecent(networkId: NetworkId): Promise<number> {
    return FixedWindowCounter.count(
      this.database,
      LocalIdentityAdmissionLoadRepository.NAMESPACE,
      networkId.valueOf(),
    );
  }

  /** Serialized so concurrent sightings of one version cannot both miss the dedupe check. */
  public record(
    externalIdentifier: IdentityExternalIdentifier,
    networkIds: NetworkId[],
  ): Promise<void> {
    const recorded = this.pending.then(async () => {
      for (const networkId of networkIds) {
        await this.countOnce(externalIdentifier, networkId);
      }
    });

    this.pending = recorded.catch((): void => undefined);

    return recorded;
  }
}
