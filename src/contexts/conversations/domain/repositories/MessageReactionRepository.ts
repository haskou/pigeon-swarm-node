import { MessageReaction } from '../entities/messages/MessageReaction';
import { ConversationId } from '../value-objects/ConversationId';
import { MessageId } from '../value-objects/MessageId';

export default abstract class MessageReactionRepository {
  public abstract delete(reaction: MessageReaction): Promise<void>;
  public abstract findByMessageIds(
    conversationId: ConversationId,
    messageIds: MessageId[],
  ): Promise<MessageReaction[]>;

  public abstract findCandidates(
    conversationId: ConversationId,
  ): Promise<MessageReaction[]>;

  public abstract save(reaction: MessageReaction): Promise<void>;
}
