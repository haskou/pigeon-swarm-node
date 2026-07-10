import { Call } from '@app/contexts/calls/domain/Call';
import { CallStartedEvent } from '@app/contexts/calls/domain/events/CallStartedEvent';
import CallRepository from '@app/contexts/calls/domain/repositories/CallRepository';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import Consumer from '@haskou/ddd-kernel/adapters/pubsub';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { PrimitiveOf } from '@haskou/value-objects';

export default class RegisterCallWhenStarted extends Consumer {
  public static QUEUE_NAME = 'pigeon-swarm.register-call-when-started';

  constructor(
    eventConsumer: DomainEventConsumer,
    private readonly repository: CallRepository,
  ) {
    super(eventConsumer);
  }

  public get queueName(): string {
    return RegisterCallWhenStarted.QUEUE_NAME;
  }

  public get eventName(): string {
    return CallStartedEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return CallStartedEvent;
  }

  public get exchange(): string {
    return pigeonEnvironment().SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    const attributes = event.attributes;

    await this.repository.registerReplica(
      Call.fromPrimitives({
        createdAt: Number(attributes.createdAt),
        creatorIdentityId: String(attributes.creatorIdentityId),
        endedAt:
          typeof attributes.endedAt === 'number'
            ? attributes.endedAt
            : undefined,
        endedByIdentityId:
          typeof attributes.endedByIdentityId === 'string'
            ? attributes.endedByIdentityId
            : undefined,
        id: event.aggregateId,
        networkId: String(attributes.networkId),
        participantIds: Array.isArray(attributes.participantIds)
          ? attributes.participantIds.filter(
              (participantId): participantId is string =>
                typeof participantId === 'string',
            )
          : [],
        participants:
          attributes.participants as PrimitiveOf<Call>['participants'],
        scope: attributes.scope as PrimitiveOf<Call>['scope'],
        status: String(attributes.status),
      }),
    );
  }
}
