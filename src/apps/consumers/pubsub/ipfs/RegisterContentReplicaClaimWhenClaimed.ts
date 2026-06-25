import ContentReplicaClaimRegistrar from '@app/contexts/content-replication/application/register-claim/ContentReplicaClaimRegistrar';
import { ContentReplicationWasClaimedEvent } from '@app/contexts/content-replication/domain/events/ContentReplicationWasClaimedEvent';
import Consumer from '@haskou/ddd-kernel/adapters/pubsub';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { DomainEventConsumer } from '@haskou/ddd-kernel/domain';

export default class RegisterContentReplicaClaimWhenClaimed extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.register-content-replica-claim-when-claimed';

  constructor(
    private readonly eventConsumer: DomainEventConsumer,
    private readonly registrar: ContentReplicaClaimRegistrar,
  ) {
    super(eventConsumer);
  }

  public get queueName(): string {
    return RegisterContentReplicaClaimWhenClaimed.QUEUE_NAME;
  }

  public get eventName(): string {
    return ContentReplicationWasClaimedEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return ContentReplicationWasClaimedEvent;
  }

  public get exchange(): string {
    return process.env.SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    await this.registrar.register({
      cid: String(event.attributes.cid),
      claimedAt: Number(event.attributes.claimedAt),
      networkId: String(event.attributes.networkId),
      nodeId: String(event.attributes.nodeId),
    });
  }
}
