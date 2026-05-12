import { MessageFindMessage } from '@app/contexts/conversations/application/find-latest-messages/messages/MessageFindMessage';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class GetConversationMessageRequest {
  constructor(
    private readonly conversationId: string,
    private readonly messageId: string,
    private readonly requesterIdentityId: IdentityId,
  ) {}

  public getMessage(): MessageFindMessage {
    return new MessageFindMessage(
      this.conversationId,
      this.messageId,
      this.requesterIdentityId.valueOf(),
    );
  }
}
