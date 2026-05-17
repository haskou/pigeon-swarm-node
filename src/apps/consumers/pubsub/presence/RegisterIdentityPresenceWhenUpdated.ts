import { IdentityPresenceWasUpdatedEvent } from '@app/contexts/presence/domain/events/IdentityPresenceWasUpdatedEvent';
import { IdentityPresence } from '@app/contexts/presence/domain/IdentityPresence';
import { PresenceStatus } from '@app/contexts/presence/domain/value-objects/PresenceStatus';
import MongoIdentityPresenceRepository from '@app/contexts/presence/infrastructure/mongo/MongoIdentityPresenceRepository';
import Kernel from '@app/Kernel';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import Consumer from '@app/shared/infrastructure/ui/consumers/Consumer';

export default class RegisterIdentityPresenceWhenUpdated extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.register-identity-presence-when-updated';

  constructor(consumer: DomainEventConsumer) {
    super(consumer);
  }

  private repository(): MongoIdentityPresenceRepository {
    return new MongoIdentityPresenceRepository(
      Kernel.di.getService<MongoDB>(MongoDB),
    );
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
    return process.env.SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    await this.repository().save(
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
        status: PresenceStatus.fromPrimitives(
          String(event.attributes.status),
        ).valueOf(),
        updatedAt: Number(event.attributes.updatedAt),
      }),
    );
  }
}
