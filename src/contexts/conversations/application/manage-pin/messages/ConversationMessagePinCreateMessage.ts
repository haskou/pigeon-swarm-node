import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { ConversationId } from '../../../domain/value-objects/ConversationId';
import { MessageId } from '../../../domain/value-objects/MessageId';

export class ConversationMessagePinCreateMessage {
  public readonly conversationId: ConversationId;
  public readonly identityId: IdentityId;
  public readonly messageId: MessageId;

  constructor(identityId: string, conversationId: string, messageId: string) {
    this.identityId = new IdentityId(identityId);
    this.conversationId = new ConversationId(conversationId);
    this.messageId = new MessageId(messageId);
  }
}
