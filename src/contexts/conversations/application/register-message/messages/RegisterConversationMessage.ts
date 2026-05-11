import { ConversationId } from '../../../domain/value-objects/ConversationId';
import { MessageId } from '../../../domain/value-objects/MessageId';

export class RegisterConversationMessage {
  public readonly conversationId: ConversationId;
  public readonly messageId: MessageId;

  constructor(conversationId: string, messageId: string) {
    this.conversationId = new ConversationId(conversationId);
    this.messageId = new MessageId(messageId);
  }
}
