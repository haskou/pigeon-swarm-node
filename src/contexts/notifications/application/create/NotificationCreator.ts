import { ConversationInvitationPayload } from '@app/contexts/notifications/domain/ConversationInvitationPayload';
import { Notification } from '@app/contexts/notifications/domain/Notification';
import { NotificationRepository } from '@app/contexts/notifications/domain/repositories/NotificationRepository';

import { NotificationCreateMessage } from './messages/NotificationCreateMessage';

export default class NotificationCreator {
  constructor(private readonly repository: NotificationRepository) {}

  public async create(
    message: NotificationCreateMessage,
  ): Promise<Notification> {
    const notification = Notification.conversationInvitation(
      ConversationInvitationPayload.fromPrimitives({
        conversationId: message.conversationId.valueOf(),
        encryptedConversationKey: message.encryptedConversationKey.valueOf(),
        inviterIdentityId: message.inviterIdentityId.valueOf(),
        keychainExternalIdentifier: undefined,
        keyEncryptionAlgorithm: message.keyEncryptionAlgorithm?.valueOf(),
        recipientIdentityId: message.recipientIdentityId.valueOf(),
        signature: message.signature.valueOf(),
      }),
    );

    await this.repository.save(notification);

    return notification;
  }
}
