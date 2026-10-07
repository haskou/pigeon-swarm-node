import CallEventAttestor from '@app/contexts/calls/application/attest-event/CallEventAttestor';
import { CallStartedEvent } from '@app/contexts/calls/domain/events/CallStartedEvent';
import PushNotificationDispatcher from '@app/contexts/push-notifications/application/send/PushNotificationDispatcher';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import Kernel from '@haskou/ddd-kernel';
import { DomainEvent } from '@haskou/ddd-kernel/domain';

import SendPushNotificationWhenEventReceived from './SendPushNotificationWhenEventReceived';

export default class SendPushNotificationWhenCallStarted extends SendPushNotificationWhenEventReceived {
  public static QUEUE_NAME = 'pigeon-swarm.send-push-when-call-started';

  constructor(
    eventConsumer: DomainEventConsumer,
    notificationDispatcher: PushNotificationDispatcher,
    private readonly attestor: CallEventAttestor,
  ) {
    super(eventConsumer, notificationDispatcher);
  }

  /**
   * Only a start this node admitted from signed records rings anyone. The
   * check may wait for the record to arrive, so it never blocks the topic.
   */
  public handler(event: DomainEvent): Promise<void> {
    void this.attestor
      .attest(event)
      .then((attested) => attested && super.handler(attested))
      .catch((error) => {
        Kernel.logger.warn?.(
          `Call start push failed: callId=${event.aggregateId} error=${String(error)}`,
        );
      });

    return Promise.resolve();
  }

  public get queueName(): string {
    return SendPushNotificationWhenCallStarted.QUEUE_NAME;
  }

  public get eventName(): string {
    return CallStartedEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return CallStartedEvent;
  }
}
