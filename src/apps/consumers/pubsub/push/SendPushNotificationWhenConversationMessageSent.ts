import { ConversationMessageWasSentEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasSentEvent';
import PushNotificationDispatcher from '@app/contexts/push-notifications/application/send/PushNotificationDispatcher';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';

import SendPushNotificationWhenEventReceived from './SendPushNotificationWhenEventReceived';

// eslint-disable-next-line max-len
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
