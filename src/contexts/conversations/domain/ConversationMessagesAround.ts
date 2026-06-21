import { Message } from './entities/messages/Message';
import { MessageId } from './value-objects/MessageId';

export class ConversationMessagesAround {
  constructor(
    private readonly messages: Message[],
    private readonly nextCursor?: MessageId,
    private readonly previousCursor?: MessageId,
  ) {}

  public getMessages(): Message[] {
    return [...this.messages];
  }

  public getNextCursor(): MessageId | undefined {
    return this.nextCursor;
  }

  public getPreviousCursor(): MessageId | undefined {
    return this.previousCursor;
  }
}
