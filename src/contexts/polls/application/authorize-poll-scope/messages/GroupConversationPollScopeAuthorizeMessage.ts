import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class GroupConversationPollScopeAuthorizeMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly conversationId: ConversationId;

  constructor(actorIdentityId: string, conversationId: string) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.conversationId = new ConversationId(conversationId);
  }
}
