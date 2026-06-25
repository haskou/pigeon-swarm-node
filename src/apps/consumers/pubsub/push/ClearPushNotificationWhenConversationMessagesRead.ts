import { ConversationMessagesWereReadEvent } from '@app/contexts/conversations/domain/events/ConversationMessagesWereReadEvent';
import PushNotificationDispatcher from '@app/contexts/push-notifications/application/send/PushNotificationDispatcher';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { DomainEventConsumer } from '@haskou/ddd-kernel/domain';

import SendPushNotificationWhenEventReceived from './SendPushNotificationWhenEventReceived';

export default class ClearPushNotificationWhenConversationMessagesRead extends SendPushNotificationWhenEventReceived {
  public static QUEUE_NAME =
    'pigeon-swarm.clear-push-when-conversation-messages-read';

  constructor(
    private readonly eventConsumer: DomainEventConsumer,
    private readonly notificationDispatcher: PushNotificationDispatcher,
  ) {
    super(eventConsumer, notificationDispatcher);
  }

  public get queueName(): string {
    return ClearPushNotificationWhenConversationMessagesRead.QUEUE_NAME;
  }

  public get eventName(): string {
    return ConversationMessagesWereReadEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return ConversationMessagesWereReadEvent;
  }
}
