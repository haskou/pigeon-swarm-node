import { ConversationMessageWasSentEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasSentEvent';
import PushNotificationDispatcher from '@app/contexts/push-notifications/application/send/PushNotificationDispatcher';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import { DomainEvent } from '@haskou/ddd-kernel/domain';

import SendPushNotificationWhenEventReceived from './SendPushNotificationWhenEventReceived';

export default class SendPushNotificationWhenConversationMessageSent extends SendPushNotificationWhenEventReceived {
  public static QUEUE_NAME =
    'pigeon-swarm.send-push-when-conversation-message-sent';

  constructor(
    private readonly eventConsumer: DomainEventConsumer,
    private readonly notificationDispatcher: PushNotificationDispatcher,
  ) {
    super(eventConsumer, notificationDispatcher);
  }

  public get queueName(): string {
    return SendPushNotificationWhenConversationMessageSent.QUEUE_NAME;
  }

  public get eventName(): string {
    return ConversationMessageWasSentEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return ConversationMessageWasSentEvent;
  }
}
