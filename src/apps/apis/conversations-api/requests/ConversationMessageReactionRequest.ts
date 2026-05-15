import { MessageReactionAddMessage } from '@app/contexts/conversations/application/add-reaction/messages/MessageReactionAddMessage';
import { MessageReactionRemoveMessage } from '@app/contexts/conversations/application/remove-reaction/messages/MessageReactionRemoveMessage';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { ConversationMessageReactionBody } from '../bodies/ConversationMessageReactionBody';

export class ConversationMessageReactionRequest {
  constructor(
    private readonly conversationId: string,
    private readonly messageId: string,
    private readonly body: ConversationMessageReactionBody,
    private readonly authorIdentityId: IdentityId,
  ) {}

  public getAddMessage(): MessageReactionAddMessage {
    return new MessageReactionAddMessage(
      this.conversationId,
      this.messageId,
      this.authorIdentityId.valueOf(),
      this.body.emoji,
    );
  }

  public getRemoveMessage(): MessageReactionRemoveMessage {
    return new MessageReactionRemoveMessage(
      this.conversationId,
      this.messageId,
      this.authorIdentityId.valueOf(),
      this.body.emoji,
    );
  }
}
