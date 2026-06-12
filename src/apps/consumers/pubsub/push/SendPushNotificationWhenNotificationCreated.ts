import { NotificationWasCreatedEvent } from '@app/contexts/notifications/domain/events/NotificationWasCreatedEvent';
import PushNotificationDispatcher from '@app/contexts/push-notifications/application/send/PushNotificationDispatcher';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';

import SendPushNotificationWhenEventReceived from './SendPushNotificationWhenEventReceived';

// eslint-disable-next-line max-len
export default class SendPushNotificationWhenNotificationCreated extends SendPushNotificationWhenEventReceived {
  public static QUEUE_NAME = 'pigeon-swarm.send-push-when-notification-created';

  constructor(
    private readonly eventConsumer: DomainEventConsumer,
    private readonly notificationDispatcher: PushNotificationDispatcher,
  ) {
    super(eventConsumer, notificationDispatcher);
  }

  public get queueName(): string {
    return SendPushNotificationWhenNotificationCreated.QUEUE_NAME;
  }

  public get eventName(): string {
    return NotificationWasCreatedEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return NotificationWasCreatedEvent;
  }
}
