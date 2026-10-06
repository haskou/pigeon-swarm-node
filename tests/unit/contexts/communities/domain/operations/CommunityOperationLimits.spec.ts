import { CommunityOperationLimitExceededError } from '@app/contexts/communities/domain/errors/CommunityOperationLimitExceededError';
import { CommunityOperation } from '@app/contexts/communities/domain/operations/CommunityOperation';
import { CommunityOperationLedger } from '@app/contexts/communities/domain/operations/CommunityOperationLedger';
import { CommunityOperationLimits } from '@app/contexts/communities/domain/operations/CommunityOperationLimits';
import { CommunityStateFold } from '@app/contexts/communities/domain/operations/CommunityStateFold';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityOperationAction } from '@app/contexts/communities/domain/value-objects/CommunityOperationAction';
import { CommunityRoleId } from '@app/contexts/communities/domain/value-objects/CommunityRoleId';

import {
  alice,
  communityId,
  genesis,
  join,
  operation,
  owner,
} from './CommunityOperationFixtures';

/** Small, so the tests do not sign a thousand operations: the rule does not depend on the number. */
const QUOTA = 25;
const EXCESS = 12;

/** The owner makes alice a moderator of channels: everything she signs afterwards is permitted. */
function moderated(): {
  base: CommunityOperation[];
  channelId: string;
  tip: CommunityOperation;
} {
  const created = genesis();
  const joinedAlice = join([created], alice);
  const roleId = CommunityRoleId.derive(
    communityId.valueOf(),
    owner.valueOf(),
    3,
  ).valueOf();
  const role = operation(
    CommunityOperationAction.ROLE_CREATED,
    owner,
    { name: 'builder', permissions: ['manage_channels'], roleId },
    [joinedAlice],
    3,
  );
  const promote = operation(
    CommunityOperationAction.MEMBER_ROLES_UPDATED,
    owner,
    { identityId: alice.valueOf(), roleIds: [roleId] },
    [role],
  );

  const createdAt = 4;
  const channelId = CommunityChannelId.derive(
    communityId.valueOf(),
    owner.valueOf(),
    createdAt,
  ).valueOf();
  const lobby = operation(
    CommunityOperationAction.CHANNEL_CREATED,
    owner,
    { channelId, name: 'lobby', type: 'text' },
    [promote],
    createdAt,
  );

  return {
    base: [created, joinedAlice, role, promote, lobby],
    channelId,
    tip: lobby,
  };
}

/** Renames the one channel of the community: the state stays the same size however many are signed. */
function rename(
  author: typeof alice,
  channelId: string,
  parents: CommunityOperation[],
  index: number,
): CommunityOperation {
  return operation(
    CommunityOperationAction.CHANNEL_RENAMED,
    author,
    { channelId, name: `lobby-${index}` },
    parents,
    1_000 + index,
  );
}

/** One member signing a straight line of operations, each building on the last. */
function chain(
  author: typeof alice,
  channelId: string,
  from: CommunityOperation,
  length: number,
): CommunityOperation[] {
  const operations: CommunityOperation[] = [];
  let parent = from;

  for (let index = 0; index < length; index++) {
    parent = rename(author, channelId, [parent], index);
    operations.push(parent);
  }

  return operations;
}

/** One member signing many operations that all build on the same one. */
function fork(
  channelId: string,
  from: CommunityOperation,
  width: number,
  offset = 0,
): CommunityOperation[] {
  return Array.from({ length: width }, (_, index) =>
    rename(alice, channelId, [from], offset + index),
  );
}

/** Operations alice can still sign after `base` before the quota is reached. */
function roomAfter(base: CommunityOperation[]): number {
  return (
    QUOTA -
    base.filter((operation) => operation.getAuthorIdentityId().isEqual(alice))
      .length
  );
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

/** Offers operations like the registry: refused ones are offered again while the batch progresses. */
function admitAll(
  ledger: CommunityOperationLedger,
  operations: CommunityOperation[],
): { admitted: string[]; refused: string[] } {
  let pending = operations;
  let progressed = true;

  while (progressed && pending.length > 0) {
    const refused: CommunityOperation[] = [];

    for (const candidate of pending) {
      try {
        ledger.admit(candidate);
      } catch {
        refused.push(candidate);
      }
    }
    progressed = refused.length < pending.length;
    pending = refused;
  }

  return {
    admitted: operations
      .filter((candidate) => ledger.has(candidate))
      .map((candidate) => candidate.getHash())
      .sort(),
    refused: pending.map((candidate) => candidate.getHash()).sort(),
  };
}

function channelNameOf(operations: CommunityOperation[]): string | undefined {
  return CommunityStateFold.fold(operations).community?.toPrimitives()
    .textChannels[0]?.name;
}

function stateOf(operations: CommunityOperation[]) {
  const state = CommunityStateFold.fold(operations);

  return {
    community: state.community?.toPrimitives(),
    frontier: state.frontier,
    skipped: [...state.skipped].sort(),
  };
}

describe('Community operation limits', () => {
  describe('argument size', () => {
    const create = (name: string) =>
      operation(
        CommunityOperationAction.COMMUNITY_UPDATED,
        owner,
        { description: 'd', name },
        [genesis()],
      );

    it('accepts arguments up to the limit', () => {
      const overhead = JSON.stringify({ description: 'd', name: '' }).length;

      expect(() =>
        create(
          'x'.repeat(CommunityOperationLimits.MAX_ARGUMENT_BYTES - overhead),
        ),
      ).not.toThrow();
    });

    it('refuses larger arguments, counted in bytes', () => {
      const overhead = JSON.stringify({ description: 'd', name: '' }).length;
      const room = CommunityOperationLimits.MAX_ARGUMENT_BYTES - overhead;

      expect(() => create('x'.repeat(room + 1))).toThrow(
        CommunityOperationLimitExceededError,
      );
      expect(() => create('é'.repeat(Math.floor(room / 2) + 1))).toThrow(
        CommunityOperationLimitExceededError,
      );
    });

    it('refuses a replicated record that carries them', () => {
      const record = {
        ...genesis().toPrimitives(),
        args: { ...genesis().getArguments(), padding: 'x'.repeat(5_000) },
      };

      expect(() => CommunityOperation.fromPrimitives(record)).toThrow(
        CommunityOperationLimitExceededError,
      );
    });
  });

  describe('operations per author', () => {
    beforeEach(() => {
      jest.replaceProperty(
        CommunityOperationLimits,
        'MAX_OPERATIONS_PER_AUTHOR',
        QUOTA,
      );
    });

    afterEach(() => jest.restoreAllMocks());

    it('refuses the operations a member signs beyond the quota on one line of history', () => {
      const { base, channelId, tip } = moderated();
      const room = roomAfter(base);
      const flood = chain(alice, channelId, tip, room + EXCESS);
      const ledger = new CommunityOperationLedger();

      base.forEach((operation) => ledger.admit(operation));
      flood.slice(0, room).forEach((operation) => ledger.admit(operation));

      expect(() => ledger.admit(flood[room])).toThrow(
        CommunityOperationLimitExceededError,
      );
      expect(ledger.has(flood[room])).toBe(false);
    });

    it('keeps the state bounded and the other authors working', () => {
      const { base, channelId, tip } = moderated();
      const room = roomAfter(base);
      const flood = chain(alice, channelId, tip, room + EXCESS);
      const ban = operation(
        CommunityOperationAction.MEMBER_BANNED,
        owner,
        { identityId: alice.valueOf() },
        [flood[flood.length - 1]],
      );
      const state = CommunityStateFold.fold([...base, ...flood, ban]);

      expect(state.skipped).toEqual(
        flood.slice(room).map((operation) => operation.getHash()),
      );
      expect(channelNameOf([...base, ...flood])).toBe(`lobby-${room - 1}`);
      expect(state.community?.toPrimitives().bannedMemberIds).toEqual([
        alice.valueOf(),
      ]);
    });

    it('skips the surplus of concurrent branches, which the admission cannot see', () => {
      const { base, channelId, tip } = moderated();
      const room = roomAfter(base);
      const flood = fork(channelId, tip, room + EXCESS);
      const ledger = new CommunityOperationLedger();

      [...base, ...flood].forEach((operation) => ledger.admit(operation));

      const state = CommunityStateFold.fold([...base, ...flood]);
      const surplus = CommunityStateFold.orderOf([...base, ...flood])
        .filter((operation) => operation.getAuthorIdentityId().isEqual(alice))
        .slice(QUOTA)
        .map((operation) => operation.getHash());

      expect(surplus).toHaveLength(EXCESS);
      expect([...state.skipped].sort()).toEqual([...surplus].sort());
    });

    it('does not count the operations of other branches against a new one', () => {
      const { base, channelId, tip } = moderated();
      const flood = fork(channelId, tip, roomAfter(base) + EXCESS);
      const ledger = new CommunityOperationLedger();

      [...base, ...flood].forEach((operation) => ledger.admit(operation));

      expect(() =>
        ledger.admit(rename(alice, channelId, [tip], QUOTA + EXCESS)),
      ).not.toThrow();
    });

    it('does not limit the founder, who moderates the community', () => {
      const { base, channelId, tip } = moderated();
      const flood = chain(owner, channelId, tip, QUOTA + EXCESS);
      const ledger = new CommunityOperationLedger();

      [...base, ...flood].forEach((operation) => ledger.admit(operation));

      expect(ledger.has(flood[flood.length - 1])).toBe(true);
      expect(CommunityStateFold.fold([...base, ...flood]).skipped).toEqual([]);
    });
  });

  describe('convergence', () => {
    beforeEach(() => {
      jest.replaceProperty(
        CommunityOperationLimits,
        'MAX_OPERATIONS_PER_AUTHOR',
        QUOTA,
      );
    });

    afterEach(() => jest.restoreAllMocks());

    it('makes nodes with different arrival orders admit the same operations', () => {
      const { base, channelId, tip } = moderated();
      const room = roomAfter(base);
      const flood = chain(alice, channelId, tip, room + EXCESS);
      const all = [...base, ...flood];
      const results = [1, 2, 3].map((seed) =>
        admitAll(new CommunityOperationLedger(), shuffled(all, seed)),
      );

      expect(results[0].admitted).toHaveLength(base.length + room);
      expect(results[0].refused).toHaveLength(EXCESS);
      expect(results[1]).toEqual(results[0]);
      expect(results[2]).toEqual(results[0]);
    });

    it('makes nodes with different arrival orders fold the same state', () => {
      const { base, channelId, tip } = moderated();
      const flood = [
        ...chain(alice, channelId, tip, 10),
        ...fork(channelId, tip, roomAfter(base) + EXCESS, 100),
      ];
      const all = [...base, ...flood];
      const expected = stateOf(all);

      expect(expected.skipped).toHaveLength(EXCESS + 10);
      for (const seed of [4, 5, 6]) {
        expect(stateOf(shuffled(all, seed))).toEqual(expected);
      }
    });
  });
});
