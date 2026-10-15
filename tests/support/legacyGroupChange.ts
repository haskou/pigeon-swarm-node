import { ConversationOperation } from '@app/contexts/conversations/domain/operations/ConversationOperation';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';

/**
 * A member or admin change of a group conversation as nodes accepted it
 * before group rosters moved into MLS. Nodes now refuse this shape, so the
 * domain cannot build it: the record is spelled out here.
 */
export function legacyGroupChange(input: {
  action: string;
  args: Record<string, unknown>;
  authorIdentityId: string;
  conversationId: string;
  createdAt?: number;
  networkId: string;
  parents: string[];
}): Record<string, unknown> {
  const content = {
    action: input.action,
    args: input.args,
    authorIdentityId: input.authorIdentityId,
    conversationId: input.conversationId,
    createdAt: input.createdAt ?? 1_780_000_000_001,
    networkId: input.networkId,
    parents: [...input.parents].sort(),
    scopeType: 'conversation_operation',
  };

  return {
    ...content,
    id: ConversationOperation.recordIdOf(
      input.conversationId,
      PublicMutationProof.digestOf(content),
    ),
  };
}
