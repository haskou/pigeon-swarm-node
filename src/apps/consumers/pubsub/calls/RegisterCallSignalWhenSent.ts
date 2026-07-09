import CallSignalDeliveryRegistrar from '@app/contexts/calls/application/register-signal-delivery/CallSignalDeliveryRegistrar';
import { CallSignalDeliveryRegisterMessage } from '@app/contexts/calls/application/register-signal-delivery/messages/CallSignalDeliveryRegisterMessage';
import { CallSignalSentEvent } from '@app/contexts/calls/domain/events/CallSignalSentEvent';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import Consumer from '@haskou/ddd-kernel/adapters/pubsub';
import { DomainEvent } from '@haskou/ddd-kernel/domain';

export default class RegisterCallSignalWhenSent extends Consumer {
  public static QUEUE_NAME = 'pigeon-swarm.register-call-signal-when-sent';

  constructor(
    eventConsumer: DomainEventConsumer,
    private readonly registrar: CallSignalDeliveryRegistrar,
  ) {
    super(eventConsumer);
  }

  public get queueName(): string {
    return RegisterCallSignalWhenSent.QUEUE_NAME;
  }

  public get eventName(): string {
    return CallSignalSentEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return CallSignalSentEvent;
  }

  public get exchange(): string {
    return pigeonEnvironment().SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    const participantIds = Array.isArray(event.attributes.participantIds)
      ? event.attributes.participantIds.filter(
          (participantId): participantId is string =>
            typeof participantId === 'string',
        )
      : [];

    await this.registrar.register(
      new CallSignalDeliveryRegisterMessage({
        attempt: Number(event.attributes.attempt),
        callId: String(event.attributes.callId),
        expiresAt: Number(event.attributes.expiresAt),
        networkId: String(event.attributes.networkId),
        ownerNodeId: String(event.attributes.ownerNodeId),
        participantIds,
        payload: event.attributes.payload,
        recipientIdentityId: String(event.attributes.recipientIdentityId),
        senderIdentityId: String(event.attributes.senderIdentityId),
        sentAt: Number(event.attributes.sentAt),
        signalId: String(event.attributes.signalId),
        signalType: String(event.attributes.signalType),
      }),
    );
  }
}
