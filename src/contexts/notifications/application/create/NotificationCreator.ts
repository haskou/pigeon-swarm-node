import { CommunityInvitationPayload } from '@app/contexts/notifications/domain/CommunityInvitationPayload';
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
    const notification = message.communityId
      ? Notification.communityInvitation(
          CommunityInvitationPayload.fromPrimitives({
            communityId: message.communityId.valueOf(),
            encryptedCommunityKey:
              message.encryptedCommunityKey?.valueOf() || '',
            inviterIdentityId: message.inviterIdentityId.valueOf(),
            inviterSignature: message.inviterSignature.valueOf(),
            recipientIdentityId: message.recipientIdentityId.valueOf(),
          }),
        )
      : Notification.conversationInvitation(
          ConversationInvitationPayload.fromPrimitives({
            conversationId: message.conversationId?.valueOf() || '',
            encryptedConversationKey:
              message.encryptedConversationKey?.valueOf() || '',
            inviterIdentityId: message.inviterIdentityId.valueOf(),
            inviterSignature: message.inviterSignature.valueOf(),
            recipientIdentityId: message.recipientIdentityId.valueOf(),
          }),
        );

    await this.repository.save(notification);
    await this.eventPublisher.publish(notification.pullDomainEvents());

    return notification;
  }
}
