import { MessageFindMessage } from './MessageFindMessage';

export class ThreadMessagesFindMessage extends MessageFindMessage {
  public readonly limit: number;

  constructor(
    conversationId: string,
    messageId: string,
    requesterIdentityId: string,
    limit = 50,
  ) {
    super(conversationId, messageId, requesterIdentityId);
    this.limit = limit;
  }
}
