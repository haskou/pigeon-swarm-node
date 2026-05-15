import { MessageReaction } from '../MessageReaction';
import { ConversationId } from '../value-objects/ConversationId';
import { MessageId } from '../value-objects/MessageId';

export interface MessageReactionRepository {
  delete(reaction: MessageReaction): Promise<void>;
  findByMessageIds(
    conversationId: ConversationId,
    messageIds: MessageId[],
  ): Promise<MessageReaction[]>;
  findCandidates(conversationId: ConversationId): Promise<MessageReaction[]>;
  save(reaction: MessageReaction): Promise<void>;
}
