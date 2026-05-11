import { NotificationCreateMessage } from '@app/contexts/notifications/application/create/messages/NotificationCreateMessage';

import { PostNotificationBody } from '../bodies/PostNotificationBody';

export class PostNotificationRequest {
  constructor(private readonly body: PostNotificationBody) {}

  public getMessage(): NotificationCreateMessage {
    return new NotificationCreateMessage(
      this.body.conversationId,
      this.body.inviterIdentityId,
      this.body.recipientIdentityId,
      this.body.encryptedConversationKey,
      this.body.inviterSignature,
    );
  }
}
