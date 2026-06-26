import { pigeonEnvironment } from '@app/apps/PigeonEnvironment';
import ContentReplicationMetadataRegistrar from '@app/contexts/content-replication/application/register-content/ContentReplicationMetadataRegistrar';
import { ContentReplicationWasRegisteredEvent } from '@app/contexts/content-replication/domain/events/ContentReplicationWasRegisteredEvent';
import Consumer from '@haskou/ddd-kernel/adapters/pubsub';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { DomainEventConsumer } from '@haskou/ddd-kernel/domain';

export default class RegisterContentReplicationWhenRegistered extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.register-content-replication-when-registered';

  constructor(
    private readonly eventConsumer: DomainEventConsumer,
    private readonly registrar: ContentReplicationMetadataRegistrar,
  ) {
    super(eventConsumer);
  }

  public get queueName(): string {
    return RegisterContentReplicationWhenRegistered.QUEUE_NAME;
  }

  public get eventName(): string {
    return ContentReplicationWasRegisteredEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return ContentReplicationWasRegisteredEvent;
  }

  public get exchange(): string {
    return pigeonEnvironment().SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    await this.registrar.register({
      cid: String(event.attributes.cid),
      contentType:
        typeof event.attributes.contentType === 'string'
          ? event.attributes.contentType
          : undefined,
      context: String(event.attributes.context),
      createdAt: Number(event.attributes.createdAt),
      filename:
        typeof event.attributes.filename === 'string'
          ? event.attributes.filename
          : undefined,
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
