import { NodePeerRegisterMessage } from '@app/contexts/nodes/application/register-peer/messages/NodePeerRegisterMessage';
import NodePeerRegistrar from '@app/contexts/nodes/application/register-peer/NodePeerRegistrar';
import { NodeHeartbeatWasSent } from '@app/contexts/nodes/domain/events/NodeHeartbeatWasSent';
import Consumer from '@haskou/ddd-kernel/adapters/pubsub';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { DomainEventConsumer } from '@haskou/ddd-kernel/domain';

type NodeHeartbeatNetwork = {
  id: string;
  name: string;
};

export default class RegisterNodePeerWhenHeartbeatReceived extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.register-node-peer-when-heartbeat-received';

  constructor(
    private readonly eventConsumer: DomainEventConsumer,
    private readonly registrar: NodePeerRegistrar,
  ) {
    super(eventConsumer);
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

  public async handler(event: DomainEvent): Promise<void> {
    await this.registrar.register(
      new NodePeerRegisterMessage(
        event.aggregateId,
        event.attributes.owner ? String(event.attributes.owner) : undefined,
        this.getNetworks(event),
        event.occurredOn.getTime(),
      ),
    );
  }
}
