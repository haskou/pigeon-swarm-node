import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { Timestamp } from '@haskou/value-objects';

import { Identity } from '../Identity';
import IdentityAdmissionLoadRepository from '../repositories/IdentityAdmissionLoadRepository';
import { IdentityAdmissionDifficulty } from '../value-objects/IdentityAdmissionDifficulty';

/**
 * Prices identity admissions from the load this node counted per network, and
 * charges admitted versions to that load. The API and the replication observer
 * share it, so a version is priced and counted by the same rule whichever node
 * admitted it.
 */
export default class IdentityAdmissionPricingDomainService {
  constructor(private readonly load: IdentityAdmissionLoadRepository) {}

  public async requiredFor(
    identity: Identity,
    networkIds: NetworkId[],
    now: Timestamp = Timestamp.now(),
  ): Promise<IdentityAdmissionDifficulty> {
    if (networkIds.length === 0) return IdentityAdmissionDifficulty.floor();

    if (!identity.isFreshAdmissionAt(now)) {
      return IdentityAdmissionDifficulty.max();
    }

    let required = IdentityAdmissionDifficulty.floor();

    for (const networkId of networkIds) {
      required = required.hardest(
        IdentityAdmissionDifficulty.forRecentAdmissions(
          await this.load.countRecent(networkId),
        ),
      );
    }

    return required;
  }

  public async charge(
    identityId: IdentityId,
    networkIds: NetworkId[],
  ): Promise<void> {
    if (networkIds.length === 0) return;

    await this.load.record(identityId, networkIds);
  }
}
