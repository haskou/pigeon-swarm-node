import { NodeRuntimeCapabilitiesProvider } from '@app/contexts/nodes/infrastructure/runtime/NodeRuntimeCapabilitiesProvider';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import type { NodeHeartbeatCapabilitiesProvider as CapabilitiesProvider } from './NodeHeartbeatCapabilitiesProvider';

import { NodeHeartbeatWasSent } from '../../domain/events/NodeHeartbeatWasSent';
import { NodeRepository } from '../../domain/repositories/NodeRepository';

export default class NodeHeartbeatSender {
  private readonly capabilitiesProvider: CapabilitiesProvider;

  private static defaultCapabilitiesProvider(): CapabilitiesProvider {
    return new NodeRuntimeCapabilitiesProvider();
  }

  constructor(
    private readonly nodeRepository: NodeRepository,
    private readonly eventPublisher: DomainEventPublisher,
    capabilitiesProvider?: CapabilitiesProvider,
  ) {
    this.capabilitiesProvider =
      capabilitiesProvider ?? NodeHeartbeatSender.defaultCapabilitiesProvider();
  }

  public async send(): Promise<void> {
    const node = await this.nodeRepository.loadLocalNode();
    const primitives = node.toPrimitives();
    const networks = Object.values(primitives.networks).map((network) => ({
      id: network.id,
      name: network.name,
    }));

    await this.eventPublisher.publish([
      new NodeHeartbeatWasSent(primitives.id, {
        capabilities: await this.capabilitiesProvider.find(),
        networks,
        owner: primitives.owner,
      }),
    ]);
  }
}
