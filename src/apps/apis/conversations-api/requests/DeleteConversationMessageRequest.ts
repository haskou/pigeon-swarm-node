import { MessageDeleteMessage } from '@app/contexts/conversations/application/delete-message/messages/MessageDeleteMessage';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { DeleteConversationMessageBody } from '../bodies/DeleteConversationMessageBody';

export class DeleteConversationMessageRequest {
  constructor(
    private readonly conversationId: string,
    private readonly messageId: string,
    private readonly body: DeleteConversationMessageBody,
    private readonly authorIdentityId: IdentityId,
  ) {}

  public getMessage(): MessageDeleteMessage {
    return new MessageDeleteMessage(
      this.conversationId,
      this.messageId,
      this.authorIdentityId.valueOf(),
      this.body,
    );
  }
}
