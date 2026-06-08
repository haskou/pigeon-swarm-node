import { ConversationId } from '../../../domain/value-objects/ConversationId';
import { MessageExternalIdentifier } from '../../../domain/value-objects/MessageExternalIdentifier';
import { MessageId } from '../../../domain/value-objects/MessageId';

export class RegisterConversationMessage {
  public readonly conversationId: ConversationId;
  public readonly externalIdentifier?: MessageExternalIdentifier;
  public readonly messageId: MessageId;

  constructor(
    conversationId: string,
    messageId: string,
    externalIdentifier?: string,
  ) {
    this.conversationId = new ConversationId(conversationId);
    this.externalIdentifier = externalIdentifier
      ? new MessageExternalIdentifier(externalIdentifier)
      : undefined;
    this.messageId = new MessageId(messageId);
  }
}
