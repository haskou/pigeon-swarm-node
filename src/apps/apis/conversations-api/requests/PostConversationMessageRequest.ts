import { MessageSendMessage } from '@app/contexts/conversations/application/send-message/messages/MessageSendMessage';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PostConversationMessageBody } from '../bodies/PostConversationMessageBody';

export class PostConversationMessageRequest {
  constructor(
    private readonly conversationId: string,
    private readonly body: PostConversationMessageBody,
    private readonly authorIdentityId: IdentityId,
  ) {}

  public getMessage(): MessageSendMessage {
    return new MessageSendMessage(
      this.conversationId,
      this.authorIdentityId.valueOf(),
      this.body.encryptedPayload,
      this.body.signature,
      this.body.attachmentExternalIdentifiers ?? [],
    );
  }
}
