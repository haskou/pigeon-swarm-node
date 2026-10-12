import { MessageReadProofVerifier } from '@app/contexts/conversations/application/verify-message-read-proof/MessageReadProofVerifier';
import { MessageReadProofVerifyMessage } from '@app/contexts/conversations/application/verify-message-read-proof/messages/MessageReadProofVerifyMessage';
import { ConversationMessagesWereReadEvent } from '@app/contexts/conversations/domain/events/ConversationMessagesWereReadEvent';
import { MessageReadProof } from '@app/contexts/conversations/domain/value-objects/MessageReadProof';
import PushNotificationDispatcher from '@app/contexts/push-notifications/application/send/PushNotificationDispatcher';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import { DomainEvent } from '@haskou/ddd-kernel/domain';

import SendPushNotificationWhenEventReceived from './SendPushNotificationWhenEventReceived';

export default class ClearPushNotificationWhenConversationMessagesRead extends SendPushNotificationWhenEventReceived {
  public static QUEUE_NAME =
    'pigeon-swarm.clear-push-when-conversation-messages-read';

  private readonly readProofVerifier = new MessageReadProofVerifier();

  constructor(
    eventConsumer: DomainEventConsumer,
    notificationDispatcher: PushNotificationDispatcher,
  ) {
    super(eventConsumer, notificationDispatcher);
  }

  /**
   * The cleared notifications are sent to the reader named in the receipt, so
   * an unproven receipt must never reach the dispatcher.
   */
  public async handler(event: DomainEvent): Promise<void> {
    const now = Date.now();
    const verified = this.readProofVerifier.verify(
      new MessageReadProofVerifyMessage(
        event.aggregateId,
        String(event.attributes.readerIdentityId),
        String(event.attributes.messageId),
        event.attributes.readProof,
      ),
    );

    if (!verified || !MessageReadProof.isFresh(verified.claim, now)) {
      return;
    }

    await super.handler(event);
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
