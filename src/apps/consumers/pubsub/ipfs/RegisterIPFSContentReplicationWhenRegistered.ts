import IPFSContentReplicationMetadataRegistrar from '@app/contexts/ipfs-replication/application/register-content/IPFSContentReplicationMetadataRegistrar';
import { IPFSContentReplicationWasRegisteredEvent } from '@app/contexts/ipfs-replication/domain/events/IPFSContentReplicationWasRegisteredEvent';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

export default class RegisterIPFSContentWhenRegistered extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.register-ipfs-content-replication-when-registered';

  constructor(
    consumer: DomainEventConsumer,
    private readonly registrar: IPFSContentReplicationMetadataRegistrar,
  ) {
    super(consumer);
  }

  public get queueName(): string {
    return RegisterIPFSContentWhenRegistered.QUEUE_NAME;
  }

  public get eventName(): string {
    return IPFSContentReplicationWasRegisteredEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return IPFSContentReplicationWasRegisteredEvent;
  }

  public get exchange(): string {
    return process.env.SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    await this.registrar.register({
      cid: String(event.attributes.cid),
      context: String(event.attributes.context),
      createdAt: Number(event.attributes.createdAt),
      networkIds: Array.isArray(event.attributes.networkIds)
        ? event.attributes.networkIds.map(String)
        : [],
      ownerIdentityId:
        typeof event.attributes.ownerIdentityId === 'string'
          ? event.attributes.ownerIdentityId
          : undefined,
      priority: String(event.attributes.priority),
      sizeBytes: Number(event.attributes.sizeBytes),
      updatedAt: Number(event.attributes.updatedAt),
    });
  }
}
