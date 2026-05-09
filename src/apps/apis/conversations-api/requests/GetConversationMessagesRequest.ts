import { LatestMessagesFindMessage } from '@app/contexts/conversations/application/find-latest-messages/messages/LatestMessagesFindMessage';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class GetConversationMessagesRequest {
  constructor(
    private readonly conversationId: string,
    private readonly requesterIdentityId: IdentityId,
    private readonly limit?: string,
    private readonly beforeMessageId?: string,
  ) {}

  public getMessage(): LatestMessagesFindMessage {
    return new LatestMessagesFindMessage(
      this.conversationId,
      this.requesterIdentityId.valueOf(),
      this.limit ? Number(this.limit) : undefined,
      this.beforeMessageId,
    );
  }
}
