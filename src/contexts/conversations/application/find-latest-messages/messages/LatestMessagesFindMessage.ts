import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class LatestMessagesFindMessage {
  public readonly beforeMessageId: MessageId | undefined;
  public readonly conversationId: ConversationId;
  public readonly limit: number;
  public readonly requesterIdentityId: IdentityId;

  constructor(
    conversationId: string,
    requesterIdentityId: string,
    limit = 50,
    beforeMessageId?: string,
  ) {
    this.beforeMessageId = beforeMessageId
      ? new MessageId(beforeMessageId)
      : undefined;
    this.conversationId = new ConversationId(conversationId);
    this.limit = limit;
    this.requesterIdentityId = new IdentityId(requesterIdentityId);
  }
}
