import { MessageEditMessage } from '@app/contexts/conversations/application/edit-message/messages/MessageEditMessage';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PutConversationMessageBody } from '../bodies/PutConversationMessageBody';

export class PutConversationMessageRequest {
  constructor(
    private readonly conversationId: string,
    private readonly messageId: string,
    private readonly body: PutConversationMessageBody,
    private readonly authorIdentityId: IdentityId,
  ) {}

  public getMessage(): MessageEditMessage {
    return new MessageEditMessage(
      this.conversationId,
      this.messageId,
      this.authorIdentityId.valueOf(),
      this.body,
    );
  }
}
