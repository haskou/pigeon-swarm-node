import CallSignalDeliveryRegistrar from '@app/contexts/calls/application/register-signal-delivery/CallSignalDeliveryRegistrar';
import { CallSignalDeliveryRegisterMessage } from '@app/contexts/calls/application/register-signal-delivery/messages/CallSignalDeliveryRegisterMessage';
import { InvalidCallSignalError } from '@app/contexts/calls/domain/errors/InvalidCallSignalError';
import { CallSignalSentAttributes } from '@app/contexts/calls/domain/events/CallSignalSentAttributes';
import { CallSignalSentEvent } from '@app/contexts/calls/domain/events/CallSignalSentEvent';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import Kernel from '@haskou/ddd-kernel';
import Consumer from '@haskou/ddd-kernel/adapters/pubsub';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { Timestamp } from '@haskou/value-objects';

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
    let message: CallSignalDeliveryRegisterMessage;

    try {
      message = new CallSignalDeliveryRegisterMessage(
        event.attributes as CallSignalSentAttributes,
      );
      message.assertSignalIsFresh(Timestamp.now());
    } catch (error) {
      if (error instanceof InvalidCallSignalError) {
        Kernel.logger.debug?.(
          'Refused a received call signal that is not valid.',
        );

        return;
      }

      throw error;
    }

    await this.registrar.register(message);
  }
}
