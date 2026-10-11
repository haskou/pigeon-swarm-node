import { MessagesReadMarkMessage } from '@app/contexts/conversations/application/mark-messages-read/messages/MessagesReadMarkMessage';
import { MessageReadProofData } from '@app/contexts/conversations/domain/value-objects/MessageReadProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PutConversationMessagesReadUntilBody } from '../bodies/PutConversationMessagesReadUntilBody';

export class PutConversationMessagesReadUntilRequest {
  constructor(
    private readonly conversationId: string,
    private readonly body: PutConversationMessagesReadUntilBody,
    private readonly readerIdentityId: IdentityId,
    private readonly readProof: MessageReadProofData,
  ) {}

  public getMessage(): MessagesReadMarkMessage {
    return new MessagesReadMarkMessage(
      this.conversationId,
      this.readerIdentityId.valueOf(),
      this.body.messageId,
      this.readProof,
    );
  }
}
