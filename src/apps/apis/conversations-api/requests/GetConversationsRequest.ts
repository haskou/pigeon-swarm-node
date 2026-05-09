import { ConversationsFindMessage } from '@app/contexts/conversations/application/find-conversations/messages/ConversationsFindMessage';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class GetConversationsRequest {
  constructor(
    private readonly requesterIdentityId: IdentityId,
    private readonly limit?: string,
    private readonly beforeConversationId?: string,
  ) {}

  public getMessage(): ConversationsFindMessage {
    return new ConversationsFindMessage(
      this.requesterIdentityId.valueOf(),
      this.limit ? Number(this.limit) : undefined,
      this.beforeConversationId,
    );
  }
}
