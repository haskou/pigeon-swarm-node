import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import FixedWindowCounter from '@app/shared/infrastructure/local-db/FixedWindowCounter';

import IdentityAdmissionLoadRepository from '../../domain/repositories/IdentityAdmissionLoadRepository';

export default class LocalIdentityAdmissionLoadRepository extends IdentityAdmissionLoadRepository {
  private static readonly NAMESPACE = 'identity_admission_load';
  private static readonly WINDOW_MS = 60_000;

  constructor(private readonly database: EmbeddedLocalDatabase) {
    super();
  }

  public async countRecent(networkId: NetworkId): Promise<number> {
    return FixedWindowCounter.count(
      this.database,
      LocalIdentityAdmissionLoadRepository.NAMESPACE,
      networkId.valueOf(),
    );
  }

  public async record(networkIds: NetworkId[]): Promise<void> {
    for (const networkId of networkIds) {
      await FixedWindowCounter.increment(
        this.database,
        LocalIdentityAdmissionLoadRepository.NAMESPACE,
        networkId.valueOf(),
        LocalIdentityAdmissionLoadRepository.WINDOW_MS,
      );
    }
  }
}
