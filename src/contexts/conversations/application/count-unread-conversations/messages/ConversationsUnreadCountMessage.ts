import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class ConversationsUnreadCountMessage {
  public readonly conversationIds: ConversationId[];
  public readonly requesterIdentityId: IdentityId;

  constructor(requesterIdentityId: string, conversationIds: string[]) {
    this.conversationIds = conversationIds.map(
      (conversationId) => new ConversationId(conversationId),
    );
    this.requesterIdentityId = new IdentityId(requesterIdentityId);
  }
}
