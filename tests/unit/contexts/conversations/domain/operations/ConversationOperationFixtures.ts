import { ConversationOperation } from '@app/contexts/conversations/domain/operations/ConversationOperation';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { ConversationOperationAction } from '@app/contexts/conversations/domain/value-objects/ConversationOperationAction';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

/** Ascending, as the genesis of a conversation requires: creator < alice < bob < carol < dave < mallory. */
export const creator = new IdentityId(
  'MCowBQYDK2VwAyEA7UkoxijRwsbq6QM4kFmVYSlZJzpcY/k2NsFGFKyHN9E=',
);
export const alice = new IdentityId(
  'MCowBQYDK2VwAyEAbnoc3Smwt4/ROvTFWY/v9O8qlxZuPKby5Pv8zYBQW/E=',
);
export const bob = new IdentityId(
  'MCowBQYDK2VwAyEAgTl3Dqh9F19Wo1Rmw0x+zMuNipG07jeiXfYPW4/Js5Q=',
);
export const carol = new IdentityId(
  'MCowBQYDK2VwAyEAiodf/x6zhFFXes1a/uQFRWVo3XyJ4JCGOgVXvHr0nxc=',
);
export const dave = new IdentityId(
  'MCowBQYDK2VwAyEAiojj3XQJ8ZX9UtstPLpdcspnCb8dlBIb83SIAbQPb1w=',
);
export const mallory = new IdentityId(
  'MCowBQYDK2VwAyEAypOsFwUYcHHWe4PH/w7+gQjo7EUwV113JoeTM9vavnw=',
);
export const networkId = new NetworkId('550e8400-e29b-41d4-a716-446655440000');
export const nonce = 'genesis-nonce';
export const groupId = ConversationId.deriveGroup(
  networkId.valueOf(),
  creator.valueOf(),
  nonce,
);

export function operation(
  action: ConversationOperationAction,
  author: IdentityId,
  args: Record<string, unknown>,
  parents: ConversationOperation[],
  createdAt = 1,
  conversationId: ConversationId = groupId,
): ConversationOperation {
  return ConversationOperation.create({
    action,
    args,
    authorIdentityId: author,
    conversationId,
    createdAt,
    networkId,
    parents: parents.map((parent) => parent.getHash()),
  });
}

export function groupGenesis(
  participants: IdentityId[] = [creator, alice],
): ConversationOperation {
  return operation(
    ConversationOperationAction.CONVERSATION_CREATED,
    creator,
    {
      name: 'Group',
      nonce,
      participantIds: participants.map((participant) => participant.valueOf()),
      type: 'group',
    },
    [],
  );
}

export function oneToOneGenesis(): ConversationOperation {
  return operation(
    ConversationOperationAction.CONVERSATION_CREATED,
    creator,
    {
      participantIds: [creator.valueOf(), alice.valueOf()],
      type: 'one-to-one',
    },
    [],
    1,
    ConversationId.deterministic(creator, alice, networkId),
  );
}

export function add(
  parents: ConversationOperation[],
  member: IdentityId,
  author = creator,
  createdAt = 2,
): ConversationOperation {
  return operation(
    ConversationOperationAction.MEMBER_ADDED,
    author,
    { identityId: member.valueOf() },
    parents,
    createdAt,
  );
}

export function remove(
  parents: ConversationOperation[],
  member: IdentityId,
  author = creator,
  createdAt = 2,
): ConversationOperation {
  return operation(
    ConversationOperationAction.MEMBER_REMOVED,
    author,
    { identityId: member.valueOf() },
    parents,
    createdAt,
  );
}

export function promote(
  parents: ConversationOperation[],
  member: IdentityId,
  author = creator,
  createdAt = 2,
): ConversationOperation {
  return operation(
    ConversationOperationAction.ADMIN_PROMOTED,
    author,
    { identityId: member.valueOf() },
    parents,
    createdAt,
  );
}

export function demote(
  parents: ConversationOperation[],
  member: IdentityId,
  author = creator,
  createdAt = 2,
): ConversationOperation {
  return operation(
    ConversationOperationAction.ADMIN_DEMOTED,
    author,
    { identityId: member.valueOf() },
    parents,
    createdAt,
  );
}

export function leave(
  parents: ConversationOperation[],
  author: IdentityId,
  createdAt = 2,
): ConversationOperation {
  return operation(
    ConversationOperationAction.MEMBER_LEFT,
    author,
    {},
    parents,
    createdAt,
  );
}
