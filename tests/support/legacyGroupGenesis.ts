import { ConversationOperation } from '@app/contexts/conversations/domain/operations/ConversationOperation';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';

export type LegacyGroupGenesis = Record<string, unknown> & {
  conversationId: string;
  id: string;
};

/**
 * The `conversation_created` record of a group conversation as nodes accepted
 * it before group rosters moved into MLS. Nodes now refuse this shape, so the
 * domain cannot build it: the id derivation is spelled out here.
 */
export function legacyGroupGenesis(input: {
  createdAt?: number;
  creatorIdentityId: string;
  name?: string;
  networkId: string;
  nonce?: string;
  participantIds: string[];
}): LegacyGroupGenesis {
  const nonce = input.nonce ?? 'legacy-group-nonce';
  const conversationId = `group:${createHash('sha256')
    .update(
      canonicalize({
        creatorIdentityId: input.creatorIdentityId,
        networkId: input.networkId,
        nonce,
      }) as string,
    )
    .digest('base64url')}`;
  const content = {
    action: 'conversation_created',
    args: {
      name: input.name ?? 'Legacy group',
      nonce,
      participantIds: [...input.participantIds].sort(),
      type: 'group',
    },
    authorIdentityId: input.creatorIdentityId,
    conversationId,
    createdAt: input.createdAt ?? 1_780_000_000_000,
    networkId: input.networkId,
    parents: [] as string[],
    scopeType: 'conversation_operation',
  };

  return {
    ...content,
    id: ConversationOperation.recordIdOf(
      conversationId,
      PublicMutationProof.digestOf(content),
    ),
  };
}
