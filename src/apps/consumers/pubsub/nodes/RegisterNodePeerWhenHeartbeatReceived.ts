import type { NodePeerCapabilitiesPayload } from '@app/contexts/nodes/application/register-peer/messages/types/NodePeerCapabilitiesPayload';

import { NodePeerRegisterMessage } from '@app/contexts/nodes/application/register-peer/messages/NodePeerRegisterMessage';
import NodePeerRegistrar from '@app/contexts/nodes/application/register-peer/NodePeerRegistrar';
import { NodeHeartbeatWasSent } from '@app/contexts/nodes/domain/events/NodeHeartbeatWasSent';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

type NodeHeartbeatNetwork = {
  id: string;
  name: string;
};

export default class RegisterNodePeerWhenHeartbeatReceived extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.register-node-peer-when-heartbeat-received';

  constructor(
    consumer: DomainEventConsumer,
    private readonly registrar: NodePeerRegistrar,
  ) {
    super(consumer);
  }

  public get queueName(): string {
    return RegisterNodePeerWhenHeartbeatReceived.QUEUE_NAME;
  }

  public get eventName(): string {
    return NodeHeartbeatWasSent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return NodeHeartbeatWasSent;
  }

  public get exchange(): string {
    return process.env.SERVICE_NAME || 'pigeon-swarm';
  }

  private getNetworks(event: DomainEvent): NodeHeartbeatNetwork[] {
    if (!Array.isArray(event.attributes.networks)) {
      return [];
    }

    return event.attributes.networks
      .filter(
        (network): network is NodeHeartbeatNetwork =>
          typeof network === 'object' &&
          network !== null &&
          'id' in network &&
          'name' in network,
      )
      .map((network) => ({
        id: String(network.id),
        name: String(network.name),
      }));
  }

  private getCapabilities(
    event: DomainEvent,
  ): NodePeerCapabilitiesPayload | undefined {
    const capabilities = this.capabilitiesRecord(event);

    if (!capabilities) {
      return undefined;
    }

    return {
      contentFallback: this.booleanCapability(capabilities, 'contentFallback'),
      gossipsub: this.booleanCapability(capabilities, 'gossipsub'),
      privateIpfs: this.booleanCapability(capabilities, 'privateIpfs'),
      privateIpfsPeerCount: this.numberCapability(
        capabilities,
        'privateIpfsPeerCount',
      ),
      publicIpfs: this.booleanCapability(capabilities, 'publicIpfs'),
      publicIpfsPeerCount: this.numberCapability(
        capabilities,
        'publicIpfsPeerCount',
      ),
      relay: this.booleanCapability(capabilities, 'relay'),
    };
  }

  private capabilitiesRecord(
    event: DomainEvent,
  ): Record<string, unknown> | undefined {
    const capabilities = event.attributes.capabilities;

    if (
      typeof capabilities !== 'object' ||
      capabilities === null ||
      Array.isArray(capabilities)
    ) {
      return undefined;
    }

    return capabilities as Record<string, unknown>;
  }

  private booleanCapability(
    capabilities: Record<string, unknown>,
    key: string,
  ): boolean | undefined {
    return typeof capabilities[key] === 'boolean'
      ? Boolean(capabilities[key])
      : undefined;
  }

  private numberCapability(
    capabilities: Record<string, unknown>,
    key: string,
  ): number | undefined {
    return typeof capabilities[key] === 'number'
      ? Number(capabilities[key])
      : undefined;
  }

  public async handler(event: DomainEvent): Promise<void> {
    await this.registrar.register(
      new NodePeerRegisterMessage(
        event.aggregateId,
        event.attributes.owner ? String(event.attributes.owner) : undefined,
        this.getNetworks(event),
        event.occurredOn.getTime(),
        this.getCapabilities(event),
      ),
    );
  }
}
