import { NotificationCreateMessage } from '@app/contexts/notifications/application/create/messages/NotificationCreateMessage';

import { PostNotificationBody } from '../bodies/PostNotificationBody';
import { GroupInvitationNamesConversationError } from '../errors/GroupInvitationNamesConversationError';

export class PostNotificationRequest {
  constructor(private readonly body: PostNotificationBody) {}

  public getMessage(): NotificationCreateMessage {
    const messageFactories = {
      community_invitation: (): NotificationCreateMessage =>
        NotificationCreateMessage.communityInvitation(
          this.body.communityId || '',
          this.body.inviterIdentityId,
          this.body.recipientIdentityId,
          this.body.nonce,
          this.body.mutation,
        ),
      conversation_invitation: (): NotificationCreateMessage =>
        NotificationCreateMessage.conversationInvitation(
          this.body.conversationId || '',
          this.body.inviterIdentityId,
          this.body.recipientIdentityId,
          this.body.encryptedConversationKey || '',
          this.body.nonce,
          this.body.mutation,
        ),
      group_conversation_invitation: (): NotificationCreateMessage => {
        if (this.body.conversationId !== undefined) {
          throw new GroupInvitationNamesConversationError();
        }

        return NotificationCreateMessage.groupConversationInvitation(
          this.body.inviterIdentityId,
          this.body.recipientIdentityId,
          this.body.encryptedConversationKey || '',
          this.body.nonce,
          this.body.mutation,
        );
      },
    };

    return messageFactories[this.body.type]();
  }
}
