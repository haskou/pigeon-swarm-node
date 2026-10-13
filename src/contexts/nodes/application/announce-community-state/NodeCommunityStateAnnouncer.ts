import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { NodeCommunityStateWasAnnounced } from '../../domain/events/NodeCommunityStateWasAnnounced';
import NodeCommunityStateDigester from '../../domain/services/NodeCommunityStateDigester';
import NodeNetworkSynchronizationMonitor from '../find-network-synchronization/NodeNetworkSynchronizationMonitor';

export default class NodeCommunityStateAnnouncer {
  constructor(
    private readonly monitor: NodeNetworkSynchronizationMonitor,
    private readonly digester: NodeCommunityStateDigester,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async announce(): Promise<void> {
    const events: NodeCommunityStateWasAnnounced[] = [];

    for (const network of this.monitor.observedNetworks()) {
      const digest = await this.digester.digest(network.id);

      this.monitor.recordLocalCommunityState(network.id, digest);
      events.push(
        new NodeCommunityStateWasAnnounced(network.localPeerId, {
          digest: digest.valueOf(),
          networkId: network.id,
        }),
      );
    }

    if (events.length > 0) {
      await this.eventPublisher.publish(events);
    }
  }
}
