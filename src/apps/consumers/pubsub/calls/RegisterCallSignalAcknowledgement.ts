import CallSignalAcknowledgementRegistrar from '@app/contexts/calls/application/register-signal-acknowledgement/CallSignalAcknowledgementRegistrar';
import { CallSignalAcknowledgementRegisterMessage } from '@app/contexts/calls/application/register-signal-acknowledgement/messages/CallSignalAcknowledgementRegisterMessage';
import { CallSignalAcknowledgedEvent } from '@app/contexts/calls/domain/events/CallSignalAcknowledgedEvent';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import Consumer from '@haskou/ddd-kernel/adapters/pubsub';
import { DomainEvent } from '@haskou/ddd-kernel/domain';

export default class RegisterCallSignalAcknowledgement extends Consumer {
  public static QUEUE_NAME =
    'pigeon-swarm.register-call-signal-acknowledgement';

  constructor(
    eventConsumer: DomainEventConsumer,
    private readonly registrar: CallSignalAcknowledgementRegistrar,
  ) {
    super(eventConsumer);
  }

  public get queueName(): string {
    return RegisterCallSignalAcknowledgement.QUEUE_NAME;
  }

  public get eventName(): string {
    return CallSignalAcknowledgedEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return CallSignalAcknowledgedEvent;
  }

  public get exchange(): string {
    return pigeonEnvironment().SERVICE_NAME || 'pigeon-swarm';
  }

  public async handler(event: DomainEvent): Promise<void> {
    await this.registrar.register(
      new CallSignalAcknowledgementRegisterMessage(
        String(event.attributes.signalId),
        String(event.attributes.recipientIdentityId),
        Number(event.attributes.acknowledgedAt),
      ),
    );
  }
}
