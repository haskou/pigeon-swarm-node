import { MessageFindMessage } from './MessageFindMessage';

export class MessagesAroundFindMessage extends MessageFindMessage {
  public readonly after: number;
  public readonly before: number;

  constructor(
    conversationId: string,
    messageId: string,
    requesterIdentityId: string,
    before = 20,
    after = 20,
  ) {
    super(conversationId, messageId, requesterIdentityId);
    this.after = after;
    this.before = before;
  }
}
