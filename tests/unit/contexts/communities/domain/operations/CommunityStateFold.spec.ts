import { CommunityOperation } from '@app/contexts/communities/domain/operations/CommunityOperation';
import { CommunityStateFold } from '@app/contexts/communities/domain/operations/CommunityStateFold';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityOperationAction } from '@app/contexts/communities/domain/value-objects/CommunityOperationAction';
import { CommunityRoleId } from '@app/contexts/communities/domain/value-objects/CommunityRoleId';

import {
  alice,
  ban,
  communityId,
  genesis,
  join,
  mallory,
  networkId,
  operation,
  owner,
} from './CommunityOperationFixtures';

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

function seededRandom(seed: number): () => number {
  let state = seed;

  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;

    return state / 4294967296;
  };
}

/**
 * A random causal graph of operations signed by three identities, where the
 * owner is the only one allowed to act until roles are handed out. Parents
 * are picked among the earlier operations, so branches and merges happen.
 */
function randomGraph(seed: number): CommunityOperation[] {
  const next = seededRandom(seed);
  const pick = <T>(items: T[]): T => items[Math.floor(next() * items.length)];
  const people = [owner, owner, owner, alice, mallory];
  const permissions = [
    'ban_members',
    'manage_members',
    'manage_roles',
    'approve_members',
  ];
  const operations = [genesis(next() < 0.5)];
  const roleIds: string[] = [];

  for (let index = 0; index < 14; index++) {
    const createdAt = index + 2;
    const parents = [...new Set([pick(operations), pick(operations)])];
    const author = pick(people);
    const target = pick(people);
    const roleId = CommunityRoleId.derive(
      communityId.valueOf(),
      author.valueOf(),
      createdAt,
    ).valueOf();
    const targeting = (action: CommunityOperationAction) =>
      operation(
        action,
        author,
        { identityId: target.valueOf() },
        parents,
        createdAt,
      );
    const builders: Array<() => CommunityOperation> = [
      () => join(parents, target, author),
      () => join(parents, author, author),
      () => ban(parents, target, author),
      () => targeting(CommunityOperationAction.MEMBER_UNBANNED),
      () => targeting(CommunityOperationAction.MEMBER_KICKED),
      () =>
        operation(
          CommunityOperationAction.MEMBER_LEFT,
          author,
          { identityId: author.valueOf() },
          parents,
          createdAt,
        ),
      () =>
        operation(
          CommunityOperationAction.ROLE_CREATED,
          author,
          { name: `role-${index}`, permissions: [pick(permissions)], roleId },
          parents,
          createdAt,
        ),
      () =>
        operation(
          CommunityOperationAction.MEMBER_ROLES_UPDATED,
          author,
          {
            identityId: target.valueOf(),
            roleIds: roleIds.length > 0 ? [pick(roleIds)] : [],
          },
          parents,
          createdAt,
        ),
      () =>
        operation(
          CommunityOperationAction.COMMUNITY_UPDATED,
          author,
          { description: `description-${index}`, name: `name-${index}` },
          parents,
          createdAt,
        ),
    ];
    const built = pick(builders)();

    if (built.getAction().isEqual(CommunityOperationAction.ROLE_CREATED)) {
      roleIds.push(roleId);
    }
    operations.push(built);
  }

  return operations;
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

  it('keeps only the lowest-digest genesis when the owner signs two for one id', () => {
    const first = genesis();
    const second = genesis(true);
    const lowest = [first, second].sort((left, right) =>
      left.getHash() < right.getHash() ? -1 : 1,
    )[0];
    const state = CommunityStateFold.fold([first, second]);

    expect(state.community?.isAutoJoinEnabled()).toBe(lowest === second);
    expect(state.skipped).toHaveLength(1);
    expect(state.skipped).not.toContain(lowest.getHash());
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

  it('folds every random causal graph to one state whatever the arrival order', () => {
    let applied = 0;
    let skipped = 0;
    let forks = 0;
    let tombstones = 0;

    for (let graph = 1; graph <= 40; graph++) {
      const operations = randomGraph(graph);
      const reference = stateOf(operations);
      const withoutOne = operations.filter(
        (_, index) => index !== (graph * 7) % operations.length,
      );
      const subsetReference = stateOf(withoutOne);

      for (let seed = 1; seed <= 8; seed++) {
        expect(stateOf(shuffled(operations, seed * 7919 + graph))).toEqual(
          reference,
        );
        expect(stateOf(shuffled(withoutOne, seed * 104729 + graph))).toEqual(
          subsetReference,
        );
      }
      expect(stateOf([...operations, ...shuffled(operations, graph)])).toEqual(
        reference,
      );

      applied += operations.length - reference.skipped.length;
      skipped += reference.skipped.length;
      forks += reference.frontier.length > 1 ? 1 : 0;
      tombstones += reference.deleted ? 1 : 0;
    }

    expect(applied).toBeGreaterThan(40);
    expect(skipped).toBeGreaterThan(40);
    expect(forks).toBeGreaterThan(5);
    expect(tombstones).toBeGreaterThan(0);
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
