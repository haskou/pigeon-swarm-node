import { CommunityOperation } from '@app/contexts/communities/domain/operations/CommunityOperation';
import { CommunityStateFold } from '@app/contexts/communities/domain/operations/CommunityStateFold';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityOperationAction } from '@app/contexts/communities/domain/value-objects/CommunityOperationAction';
import { CommunityRoleId } from '@app/contexts/communities/domain/value-objects/CommunityRoleId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

const owner = new IdentityId(
  'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
);
const alice = new IdentityId(
  'MCowBQYDK2VwAyEAKV3uU7LZg0grhngWKkoR9jqZo5M3yQ2GHliIFMgdJZw=',
);
const mallory = new IdentityId(
  'MCowBQYDK2VwAyEAVqz7Fhhakf52gpEbnr//2PWqXYG/RqMhUUe5SE1h1XA=',
);
const networkId = new NetworkId('550e8400-e29b-41d4-a716-446655440000');
const nonce = 'genesis-nonce';
const communityId = CommunityId.derive(
  networkId.valueOf(),
  owner.valueOf(),
  nonce,
);

function operation(
  action: CommunityOperationAction,
  author: IdentityId,
  args: Record<string, unknown>,
  parents: CommunityOperation[],
  createdAt = 1,
): CommunityOperation {
  return CommunityOperation.create({
    action,
    args,
    authorIdentityId: author,
    communityId,
    createdAt,
    networkId,
    parents: parents.map((parent) => parent.getHash()),
  });
}

function genesis(autoJoinEnabled = false): CommunityOperation {
  return operation(
    CommunityOperationAction.COMMUNITY_CREATED,
    owner,
    {
      autoJoinEnabled,
      description: 'A community',
      discoverable: true,
      name: 'Community',
      nonce,
      visibility: 'public',
    },
    [],
  );
}

function join(
  parents: CommunityOperation[],
  member: IdentityId,
  author = owner,
): CommunityOperation {
  return operation(
    CommunityOperationAction.MEMBER_JOINED,
    author,
    { identityId: member.valueOf(), method: 'added' },
    parents,
  );
}

function ban(
  parents: CommunityOperation[],
  member: IdentityId,
  author = owner,
): CommunityOperation {
  return operation(
    CommunityOperationAction.MEMBER_BANNED,
    author,
    { identityId: member.valueOf() },
    parents,
  );
}

function stateOf(operations: CommunityOperation[]) {
  const state = CommunityStateFold.fold(operations);

  return {
    community: state.community?.toPrimitives(),
    deleted: state.deleted,
    frontier: state.frontier,
    skipped: [...state.skipped].sort(),
  };
}

function shuffled<T>(items: T[], seed: number): T[] {
  const result = [...items];
  let state = seed;

  for (let index = result.length - 1; index > 0; index--) {
    state = (state * 1664525 + 1013904223) % 4294967296;
    const swap = state % (index + 1);

    [result[index], result[swap]] = [result[swap], result[index]];
  }

  return result;
}

describe('CommunityStateFold', () => {
  it('derives the community from its genesis operation', () => {
    const state = CommunityStateFold.fold([genesis()]);

    expect(state.community?.getId().valueOf()).toBe(communityId.valueOf());
    expect(state.community?.isOwner(owner)).toBe(true);
    expect(state.deleted).toBe(false);
    expect(state.frontier).toEqual([genesis().getHash()]);
  });

  it('rejects a genesis whose community id is not derived from owner and nonce', () => {
    expect(() =>
      CommunityOperation.create({
        action: CommunityOperationAction.COMMUNITY_CREATED,
        args: {
          autoJoinEnabled: false,
          description: 'A community',
          discoverable: true,
          name: 'Community',
          nonce: 'another-nonce',
          visibility: 'public',
        },
        authorIdentityId: owner,
        communityId,
        createdAt: 1,
        networkId,
        parents: [],
      }),
    ).toThrow();
  });

  it('applies permitted operations and keeps the frontier of the last one', () => {
    const created = genesis();
    const joined = join([created], alice);
    const channel = operation(
      CommunityOperationAction.CHANNEL_CREATED,
      owner,
      {
        channelId: CommunityChannelId.derive(
          communityId.valueOf(),
          owner.valueOf(),
          5,
        ).valueOf(),
        name: 'general',
        type: 'text',
      },
      [joined],
      5,
    );

    const state = CommunityStateFold.fold([channel, joined, created]);

    expect(state.skipped).toEqual([]);
    expect(state.community?.isMember(alice)).toBe(true);
    expect(state.community?.toPrimitives().textChannels).toHaveLength(1);
    expect(state.frontier).toEqual([channel.getHash()]);
  });

  it('skips operations that are not permitted at their turn', () => {
    const created = genesis();
    const roleId = CommunityRoleId.derive(
      communityId.valueOf(),
      mallory.valueOf(),
      9,
    ).valueOf();
    const forgedRole = operation(
      CommunityOperationAction.ROLE_CREATED,
      mallory,
      { name: 'admin', permissions: ['manage_roles'], roleId },
      [created],
      9,
    );
    const forgedBan = ban([created], owner, mallory);
    const forgedJoin = join([created], mallory, mallory);

    const state = CommunityStateFold.fold([
      created,
      forgedRole,
      forgedBan,
      forgedJoin,
    ]);

    expect(state.community?.isMember(mallory)).toBe(false);
    expect(state.community?.isOwner(owner)).toBe(true);
    expect(state.community?.toPrimitives().roles).toHaveLength(1);
    expect([...state.skipped].sort()).toEqual(
      [forgedRole, forgedBan, forgedJoin].map((op) => op.getHash()).sort(),
    );
  });

  it('refuses to authorize a forged operation against its causal past', () => {
    const created = genesis();
    const forgedBan = ban([created], owner, mallory);

    expect(() => CommunityStateFold.authorize([created], forgedBan)).toThrow();
    expect(
      CommunityStateFold.authorize([created], ban([created], alice)),
    ).toBeDefined();
  });

  it('refuses an operation whose parents are unknown', () => {
    const created = genesis();
    const orphan = join([join([created], alice)], mallory);

    expect(() => CommunityStateFold.authorize([created], orphan)).toThrow();
  });

  it('refuses a second genesis for a known community', () => {
    expect(() =>
      CommunityStateFold.authorize([genesis()], genesis(true)),
    ).toThrow();
  });

  it('turns a leave of the last member into a tombstone no later operation can undo', () => {
    const created = genesis();
    const left = operation(
      CommunityOperationAction.MEMBER_LEFT,
      owner,
      { identityId: owner.valueOf() },
      [created],
    );
    const afterwards = join([left], alice);
    const concurrent = join([created], mallory);

    const state = CommunityStateFold.fold([
      created,
      left,
      afterwards,
      concurrent,
    ]);

    expect(state.deleted).toBe(true);
    expect(state.skipped).toContain(afterwards.getHash());
  });

  it('resolves a demotion racing a moderation action by the total order', () => {
    const created = genesis();
    const joinedAlice = join([created], alice);
    const joinedMallory = join([joinedAlice], mallory);
    const roleId = CommunityRoleId.derive(
      communityId.valueOf(),
      owner.valueOf(),
      3,
    ).valueOf();
    const moderator = operation(
      CommunityOperationAction.ROLE_CREATED,
      owner,
      { name: 'moderator', permissions: ['ban_members'], roleId },
      [joinedMallory],
      3,
    );
    const promote = operation(
      CommunityOperationAction.MEMBER_ROLES_UPDATED,
      owner,
      { identityId: alice.valueOf(), roleIds: [roleId] },
      [moderator],
    );
    const demote = operation(
      CommunityOperationAction.MEMBER_ROLES_UPDATED,
      owner,
      { identityId: alice.valueOf(), roleIds: [] },
      [promote],
    );
    const aliceBans = ban([promote], mallory, alice);
    const all = [
      created,
      joinedAlice,
      joinedMallory,
      moderator,
      promote,
      demote,
      aliceBans,
    ];
    const reference = stateOf(all);
    const banWins = aliceBans.getHash() < demote.getHash();

    for (let seed = 1; seed <= 25; seed++) {
      expect(stateOf(shuffled(all, seed))).toEqual(reference);
    }

    expect(
      reference.community?.bannedMemberIds.includes(mallory.valueOf()),
    ).toBe(banWins);
    expect(reference.skipped.includes(aliceBans.getHash())).toBe(!banWins);
  });

  it('converges to the same state for every arrival order of concurrent partitions', () => {
    const created = genesis(true);
    const left = [alice, mallory].map((member) => join([created], member));
    const partitionA = ban([left[0]], mallory);
    const partitionB = operation(
      CommunityOperationAction.COMMUNITY_UPDATED,
      owner,
      { description: 'Renamed', name: 'Renamed' },
      [left[1]],
      4,
    );
    const merged = operation(
      CommunityOperationAction.MEMBER_KICKED,
      owner,
      { identityId: alice.valueOf() },
      [partitionA, partitionB],
      5,
    );
    const unrelated = ban([created], alice, mallory);
    const all = [created, ...left, partitionA, partitionB, merged, unrelated];
    const reference = stateOf(all);

    for (let seed = 1; seed <= 50; seed++) {
      expect(stateOf(shuffled(all, seed))).toEqual(reference);
    }

    expect(reference.frontier).toEqual(
      [merged.getHash(), unrelated.getHash()].sort(),
    );
    expect(reference.skipped).toContain(unrelated.getHash());
  });

  it('orders ready operations by digest and always puts parents first', () => {
    const created = genesis();
    const first = join([created], alice);
    const second = join([created], mallory);
    const ordered = CommunityStateFold.orderOf([second, first, created]).map(
      (op) => op.getHash(),
    );

    expect(ordered[0]).toBe(created.getHash());
    expect(ordered.slice(1)).toEqual(
      [first.getHash(), second.getHash()].sort(),
    );
  });
});
