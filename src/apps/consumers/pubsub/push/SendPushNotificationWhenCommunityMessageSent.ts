import { CommunityChannelMessageWasSentEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageWasSentEvent';
import PushNotificationDispatcher from '@app/contexts/push-notifications/application/send/PushNotificationDispatcher';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { DomainEventConsumer } from '@haskou/ddd-kernel/domain';

import SendPushNotificationWhenEventReceived from './SendPushNotificationWhenEventReceived';

export default class SendPushNotificationWhenCommunityMessageSent extends SendPushNotificationWhenEventReceived {
  public static QUEUE_NAME =
    'pigeon-swarm.send-push-when-community-message-sent';

  constructor(
    private readonly eventConsumer: DomainEventConsumer,
    private readonly notificationDispatcher: PushNotificationDispatcher,
  ) {
    super(eventConsumer, notificationDispatcher);
  }

  public get queueName(): string {
    return SendPushNotificationWhenCommunityMessageSent.QUEUE_NAME;
  }

  public get eventName(): string {
    return CommunityChannelMessageWasSentEvent.EVENT_NAME;
  }

  public get domainEvent(): typeof DomainEvent {
    return CommunityChannelMessageWasSentEvent;
  }
}
