import { MessagesAroundFindMessage } from '@app/contexts/conversations/application/find-latest-messages/messages/MessagesAroundFindMessage';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class GetConversationMessagesAroundRequest {
  constructor(
    private readonly conversationId: string,
    private readonly messageId: string,
    private readonly requesterIdentityId: IdentityId,
    private readonly before?: string,
    private readonly after?: string,
  ) {}

  public getMessage(): MessagesAroundFindMessage {
    return new MessagesAroundFindMessage(
      this.conversationId,
      this.messageId,
      this.requesterIdentityId.valueOf(),
      this.before ? Number(this.before) : undefined,
      this.after ? Number(this.after) : undefined,
    );
  }
}
