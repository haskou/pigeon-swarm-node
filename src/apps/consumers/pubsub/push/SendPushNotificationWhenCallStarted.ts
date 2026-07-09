import { CallStartedEvent } from '@app/contexts/calls/domain/events/CallStartedEvent';
import PushNotificationDispatcher from '@app/contexts/push-notifications/application/send/PushNotificationDispatcher';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import { DomainEvent } from '@haskou/ddd-kernel/domain';

import SendPushNotificationWhenEventReceived from './SendPushNotificationWhenEventReceived';

export default class SendPushNotificationWhenCallStarted extends SendPushNotificationWhenEventReceived {
  public static QUEUE_NAME = 'pigeon-swarm.send-push-when-call-started';

  constructor(
    eventConsumer: DomainEventConsumer,
    notificationDispatcher: PushNotificationDispatcher,
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
