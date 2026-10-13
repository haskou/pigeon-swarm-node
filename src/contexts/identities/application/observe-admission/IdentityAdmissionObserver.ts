import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import IdentityAdmissionPricingDomainService from '../../domain/services/IdentityAdmissionPricingDomainService';
import { IdentityAdmissionObservationMessage } from './messages/IdentityAdmissionObservationMessage';

/**
 * Counts identity admissions other nodes accepted into the load this node
 * prices its own admissions from, so the price tracks the network-wide rate.
 * Only versions that are new and paid what this node would ask are counted,
 * and only into networks this node hosts: replayed history, underpaid floods
 * and networks named only to inflate counters cannot raise honest prices.
 */
export default class IdentityAdmissionObserver {
  constructor(
    private readonly pricing: IdentityAdmissionPricingDomainService,
  ) {}

  public async observe(
    message: IdentityAdmissionObservationMessage,
  ): Promise<void> {
    const { hostedNetworkIds, identity, previous } = message;
    const now = Timestamp.now();

    if (!identity.isFreshAdmissionAt(now)) return;

    // An update whose previous version is unknown here is charged for every
    // network: skipping it would let a chain anchored on an unpublished
    // version enter networks uncounted.
    const enteredNetworks = (
      previous
        ? identity.networksAddedSince(previous)
        : identity.getNetworkIds()
    ).filter((networkId) =>
      hostedNetworkIds.some((hosted) => hosted.isEqual(networkId)),
    );

    if (enteredNetworks.length === 0) return;

    const required = await this.pricing.requiredFor(
      identity,
      enteredNetworks,
      now,
    );

    if (!identity.hasValidAdmissionProof(required)) return;

    await this.pricing.charge(
      new IdentityId(identity.toPrimitives().id),
      enteredNetworks,
    );
  }
}
