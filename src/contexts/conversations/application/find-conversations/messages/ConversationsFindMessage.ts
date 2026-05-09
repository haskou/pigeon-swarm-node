import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class ConversationsFindMessage {
  public readonly beforeConversationId: ConversationId | undefined;
  public readonly limit: number;
  public readonly requesterIdentityId: IdentityId;

  constructor(
    requesterIdentityId: string,
    limit = 20,
    beforeConversationId?: string,
  ) {
    this.beforeConversationId = beforeConversationId
      ? new ConversationId(beforeConversationId)
      : undefined;
    this.limit = limit;
    this.requesterIdentityId = new IdentityId(requesterIdentityId);
  }
}
