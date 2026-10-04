import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';

import { MessageReaction } from '../entities/messages/MessageReaction';
import { ConversationId } from '../value-objects/ConversationId';
import { MessageId } from '../value-objects/MessageId';

export default abstract class MessageReactionRepository {
  public abstract delete(
    reaction: MessageReaction,
    proof: PublicMutationProof,
  ): Promise<void>;

  public abstract findByMessageIds(
    conversationId: ConversationId,
    messageIds: MessageId[],
  ): Promise<MessageReaction[]>;

  public abstract findCandidates(
    conversationId: ConversationId,
  ): Promise<MessageReaction[]>;

  public abstract save(
    reaction: MessageReaction,
    proof: PublicMutationProof,
  ): Promise<void>;
}
