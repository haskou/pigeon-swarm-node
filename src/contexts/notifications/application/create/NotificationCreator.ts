import { ConversationInvitationPayload } from '@app/contexts/notifications/domain/ConversationInvitationPayload';
import { Notification } from '@app/contexts/notifications/domain/Notification';
import { NotificationRepository } from '@app/contexts/notifications/domain/repositories/NotificationRepository';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { NotificationCreateMessage } from './messages/NotificationCreateMessage';

export default class NotificationCreator {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async create(
    message: NotificationCreateMessage,
  ): Promise<Notification> {
    const notification = Notification.conversationInvitation(
      ConversationInvitationPayload.fromPrimitives({
        conversationId: message.conversationId.valueOf(),
        encryptedConversationKey: message.encryptedConversationKey.valueOf(),
        inviterIdentityId: message.inviterIdentityId.valueOf(),
        inviterSignature: message.inviterSignature.valueOf(),
        keychainExternalIdentifier: undefined,
        recipientIdentityId: message.recipientIdentityId.valueOf(),
      }),
    );

    await this.repository.save(notification);
    await this.eventPublisher.publish(notification.pullDomainEvents());

    return notification;
  }
}
