import { NotificationCreateMessage } from '@app/contexts/notifications/application/create/messages/NotificationCreateMessage';

import { PostNotificationBody } from '../bodies/PostNotificationBody';

export class PostNotificationRequest {
  constructor(private readonly body: PostNotificationBody) {}

  public getMessage(): NotificationCreateMessage {
    const messageFactories = {
      community_invitation: (): NotificationCreateMessage =>
        NotificationCreateMessage.communityInvitation(
          this.body.communityId || '',
          this.body.inviterIdentityId,
          this.body.recipientIdentityId,
          this.body.encryptedCommunityKey || '',
          this.body.inviterSignature,
        ),
      conversation_invitation: (): NotificationCreateMessage =>
        NotificationCreateMessage.conversationInvitation(
          this.body.conversationId || '',
          this.body.inviterIdentityId,
          this.body.recipientIdentityId,
          this.body.encryptedConversationKey || '',
          this.body.inviterSignature,
        ),
      group_conversation_invitation: (): NotificationCreateMessage =>
        NotificationCreateMessage.groupConversationInvitation(
          this.body.conversationId || '',
          this.body.inviterIdentityId,
          this.body.recipientIdentityId,
          this.body.encryptedConversationKey || '',
          this.body.inviterSignature,
        ),
    };

    return messageFactories[this.body.type]();
  }
}
