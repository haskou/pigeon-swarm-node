import { IdentityPresenceWasUpdatedEvent } from '@app/contexts/presence/domain/events/IdentityPresenceWasUpdatedEvent';
import { IdentityPresence } from '@app/contexts/presence/domain/IdentityPresence';
import IdentityPresenceRepository from '@app/contexts/presence/domain/repositories/IdentityPresenceRepository';
import { PresenceStatus } from '@app/contexts/presence/domain/value-objects/PresenceStatus';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import Consumer from '@haskou/ddd-kernel/adapters/pubsub';
import { DomainEvent } from '@haskou/ddd-kernel/domain';

export default class RegisterIdentityPresenceWhenUpdated extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.register-identity-presence-when-updated';

  constructor(
    eventConsumer: DomainEventConsumer,
    private readonly repository: IdentityPresenceRepository,
  ) {
    super(eventConsumer);
  }

  public get queueName(): string {
    return RegisterIdentityPresenceWhenUpdated.QUEUE_NAME;
  }

  public get eventName(): string {
    return IdentityPresenceWasUpdatedEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return IdentityPresenceWasUpdatedEvent;
  }

  public get exchange(): string {
    return pigeonEnvironment().SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    const networkIds = Array.isArray(event.attributes.networkIds)
      ? event.attributes.networkIds.filter(
          (networkId): networkId is string => typeof networkId === 'string',
        )
      : [];

    const ownerNodeId = new NodeId(String(event.attributes.ownerNodeId));

    await this.repository.save(
      IdentityPresence.fromPrimitives({
        customMessage:
          typeof event.attributes.customMessage === 'string'
            ? event.attributes.customMessage
            : undefined,
        identityId: event.aggregateId,
        lastActivityAt:
          typeof event.attributes.lastActivityAt === 'number'
            ? event.attributes.lastActivityAt
            : undefined,
        lastHeartbeatAt:
          typeof event.attributes.lastHeartbeatAt === 'number'
            ? event.attributes.lastHeartbeatAt
            : undefined,
        ownerNodeId: ownerNodeId.valueOf(),
        preferenceUpdatedAt: Number(event.attributes.preferenceUpdatedAt),
        selectedStatus: PresenceStatus.fromPrimitives(
          String(event.attributes.selectedStatus),
        ).valueOf(),
        status: PresenceStatus.fromPrimitives(
          String(event.attributes.status),
        ).valueOf(),
        updatedAt: Number(event.attributes.updatedAt),
      }),
      networkIds,
    );
  }
}
