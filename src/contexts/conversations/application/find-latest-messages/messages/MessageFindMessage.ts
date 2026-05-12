import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class MessageFindMessage {
  public readonly conversationId: ConversationId;
  public readonly messageId: MessageId;
  public readonly requesterIdentityId: IdentityId;

  constructor(
    conversationId: string,
    messageId: string,
    requesterIdentityId: string,
  ) {
    this.conversationId = new ConversationId(conversationId);
    this.messageId = new MessageId(messageId);
    this.requesterIdentityId = new IdentityId(requesterIdentityId);
  }
}
