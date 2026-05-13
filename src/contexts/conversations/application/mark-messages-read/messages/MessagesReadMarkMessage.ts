import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { ConversationId } from '../../../domain/value-objects/ConversationId';
import { MessageId } from '../../../domain/value-objects/MessageId';

export class MessagesReadMarkMessage {
  public readonly conversationId: ConversationId;
  public readonly messageId: MessageId;
  public readonly readerIdentityId: IdentityId;

  constructor(
    conversationId: string,
    readerIdentityId: string,
    messageId: string,
  ) {
    this.conversationId = new ConversationId(conversationId);
    this.readerIdentityId = new IdentityId(readerIdentityId);
    this.messageId = new MessageId(messageId);
  }
}
