import { Message } from '../../domain/entities/messages/Message';

export class ConversationMessagePinResource {
  public readonly createdAt!: number;
  public readonly message!: Message;
  public readonly messageId!: string;
  public readonly pinnedByIdentityId!: string;
}
