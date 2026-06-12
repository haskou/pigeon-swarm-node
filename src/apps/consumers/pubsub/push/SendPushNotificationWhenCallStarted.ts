import { CallStartedEvent } from '@app/contexts/calls/domain/events/CallStartedEvent';
import PushNotificationDispatcher from '@app/contexts/push-notifications/application/send/PushNotificationDispatcher';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';

import SendPushNotificationWhenEventReceived from './SendPushNotificationWhenEventReceived';

// eslint-disable-next-line max-len
export default class SendPushNotificationWhenCallStarted extends SendPushNotificationWhenEventReceived {
  public static QUEUE_NAME = 'pigeon-swarm.send-push-when-call-started';

  constructor(
    private readonly eventConsumer: DomainEventConsumer,
    private readonly notificationDispatcher: PushNotificationDispatcher,
  ) {
    super(eventConsumer, notificationDispatcher);
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
