import { ConversationId } from '../../../domain/value-objects/ConversationId';

export class ConversationSyncResponseMessage {
  public readonly conversationId: ConversationId;

  constructor(
    conversationId: string,
    public readonly requestId?: string,
  ) {
    this.conversationId = new ConversationId(conversationId);
  }
}
