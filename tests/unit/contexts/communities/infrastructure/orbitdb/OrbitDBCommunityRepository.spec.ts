import { CommunityOperation } from '@app/contexts/communities/domain/operations/CommunityOperation';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityOperationAction } from '@app/contexts/communities/domain/value-objects/CommunityOperationAction';
import OrbitDBCommunityRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityRepository';
import PrivateCommunityPublicStorageGuard from '@app/contexts/communities/infrastructure/PrivateCommunityPublicStorageGuard';
import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import PrivateAuthorizationStorageCoordinator from '@app/contexts/private-authorization/infrastructure/PrivateAuthorizationStorageCoordinator';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';

import { signedMutation } from '../../../public-mutations/support/signedMutation';
import {
  admission,
  alice,
  ban,
  communityId,
  genesis,
  invitation,
  join,
  mallory,
  operation,
  owner,
  revoke,
} from '../../domain/operations/CommunityOperationFixtures';

describe('OrbitDBCommunityRepository', () => {
  const networkId = genesis().getNetworkId().valueOf();
  const documents: Record<string, unknown>[] = [];
  const heads = new Map<string, Record<string, unknown>>();
  let hasScope: jest.Mock;
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBCommunityRepository;

  beforeEach(async () => {
    documents.splice(0);
    heads.clear();
    hasScope = jest.fn().mockResolvedValue(false);
    registry = new OrbitDBReplicatedStateRegistry();
    registry.clear();
    await registry.register(networkId, {
      communityOperations: {
        put: jest.fn((document) => {
          upsertDocument(documents, document);

          return 'ok';
        }),
        query: jest.fn((matcher) => documents.filter(matcher)),
      },
      heads: {
        get: jest.fn((key: string) => {
          const value = heads.get(key);

          return value ? { key, value } : undefined;
        }),
        put: jest.fn((key: string, value: Record<string, unknown>) => {
          heads.set(key, value);

          return 'ok';
        }),
      },
    } as never);
    repository = new OrbitDBCommunityRepository(
      registry,
      new PrivateCommunityPublicStorageGuard(
        { hasScope } as never,
        new PrivateAuthorizationStorageCoordinator(),
      ),
    );
  });

  afterEach(() => {
    registry.clear();
  });

  it('folds the signed operations of a community into its aggregate', async () => {
    const created = genesis();
    const joined = join([created], alice);

    await save(created);
    await save(joined);
    await flushBackgroundTasks();

    const community = await repository.requireById(communityId);

    expect(community.toPrimitives().memberIds.sort()).toEqual(
      [alice.valueOf(), owner.valueOf()].sort(),
    );
    expect(community?.toPrimitives().name).toBe('Community');
  });

  it('reports the unreferenced operations as the frontier', async () => {
    const created = genesis();
    const joined = join([created], alice);
    const concurrent = join([created], mallory);

    await save(created);
    await expect(repository.findFrontier(communityId)).resolves.toEqual([
      created.getHash(),
    ]);
    await save(joined);
    await save(concurrent);
    await flushBackgroundTasks();

    await expect(repository.findFrontier(communityId)).resolves.toEqual(
      [joined.getHash(), concurrent.getHash()].sort(),
    );
  });

  describe('findOperations', () => {
    it('serves every stored operation by digest, including the ones the fold skipped', async () => {
      const created = genesis();
      const joined = join([created], alice);
      const skipped = ban([created], alice, mallory);
      const stored = [created, joined, skipped];

      for (const operationToSave of stored) await save(operationToSave);
      await flushBackgroundTasks();

      const operations = await repository.findOperations(
        communityId,
        undefined,
        500,
      );

      expect(operations.map((found) => found.toPrimitives())).toEqual(
        stored
          .sort((left, right) => (left.getHash() < right.getHash() ? -1 : 1))
          .map((expected) => expected.toPrimitives()),
      );
    });

    it('pages after an exclusive digest up to the limit', async () => {
      const created = genesis();
      const operations = [
        created,
        join([created], alice),
        join([created], mallory),
      ];
      const digests = operations.map((stored) => stored.getHash()).sort();

      for (const stored of operations) await save(stored);
      await flushBackgroundTasks();

      const page = async (after: string | undefined, limit: number) =>
        (await repository.findOperations(communityId, after, limit)).map(
          (found) => found.getHash(),
        );

      await expect(page(undefined, 2)).resolves.toEqual(digests.slice(0, 2));
      await expect(page(digests[0], 500)).resolves.toEqual(digests.slice(1));
      await expect(page(digests[2], 500)).resolves.toEqual([]);
    });

    it('decodes only the operations of the page it serves', async () => {
      const created = genesis();
      const operations = [
        created,
        join([created], alice),
        join([created], mallory),
      ];
      const digests = operations.map((stored) => stored.getHash()).sort();

      for (const stored of operations) await save(stored);
      await flushBackgroundTasks();
      const decode = jest.spyOn(CommunityOperation, 'fromPrimitives');

      try {
        const page = await repository.findOperations(
          communityId,
          digests[0],
          1,
        );

        expect(page.map((found) => found.getHash())).toEqual([digests[1]]);
        expect(decode).toHaveBeenCalledTimes(1);
      } finally {
        decode.mockRestore();
      }
    });

    it('serves nothing for an unknown community', async () => {
      await expect(
        repository.findOperations(communityId, undefined, 500),
      ).resolves.toEqual([]);
    });
  });

  it('knows nothing about a community without a stored operation', async () => {
    await expect(repository.hasById(communityId)).resolves.toBe(false);
    await expect(repository.findFrontier(communityId)).resolves.toEqual([]);
    await expect(repository.findByMember(owner)).resolves.toEqual([]);
  });

  it('reports the frontier of every community of one network', async () => {
    const created = genesis();
    const joined = join([created], alice);

    await save(created);
    await save(joined);
    await flushBackgroundTasks();

    const frontiers = await repository.findFrontiersByNetwork(networkId);

    expect(
      frontiers.map(({ communityId: id, frontier }) => [
        id.valueOf(),
        frontier,
      ]),
    ).toEqual([[communityId.valueOf(), [joined.getHash()]]]);
    await expect(
      repository.findFrontiersByNetwork('another-network'),
    ).resolves.toEqual([]);
  });

  it('stores one record per operation however many times it is saved', async () => {
    const created = genesis();

    await save(created);
    await save(created);
    await flushBackgroundTasks();

    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({
      authorIdentityId: owner.valueOf(),
      communityId: communityId.valueOf(),
      id: created.getId(),
      scopeType: 'community_operation',
    });
  });

  it('converges on the same community whatever order the operations arrive in', async () => {
    const created = genesis();
    const joined = join([created], alice);
    const banned = ban([joined], alice);
    const operations = [created, joined, banned];
    const states = [];

    for (const order of [
      [0, 1, 2],
      [2, 0, 1],
      [1, 2, 0],
    ]) {
      documents.splice(0);
      heads.clear();
      registry.clear();
      await registry.register(networkId, storesOf());

      for (const index of order) await save(operations[index]);

      await flushBackgroundTasks();
      states.push((await repository.requireById(communityId)).toPrimitives());
    }

    expect(states[1]).toEqual(states[0]);
    expect(states[2]).toEqual(states[0]);
    expect(states[0]?.bannedMemberIds).toEqual([alice.valueOf()]);
  });

  describe('requireAtFrontier', () => {
    it('folds the community as it was at the frontier, not at its latest state', async () => {
      const created = genesis();
      const joined = join([created], alice);
      const banned = ban([joined], alice);

      for (const op of [created, joined, banned]) await save(op);
      await flushBackgroundTasks();

      const before = await repository.requireAtFrontier(communityId, [
        joined.getHash(),
      ]);
      const after = await repository.requireAtFrontier(communityId, [
        banned.getHash(),
      ]);

      expect(before?.toPrimitives().memberIds).toContain(alice.valueOf());
      expect(before?.toPrimitives().bannedMemberIds).toEqual([]);
      expect(after?.toPrimitives().bannedMemberIds).toEqual([alice.valueOf()]);
    });

    it('keeps judging a record at its frontier when the operations arrive shuffled', async () => {
      const created = genesis();
      const joined = join([created], alice);
      const banned = ban([joined], alice);
      const operations = [created, joined, banned];

      for (const order of [
        [2, 1, 0],
        [1, 0, 2],
      ]) {
        documents.splice(0);
        heads.clear();
        registry.clear();
        await registry.register(networkId, storesOf());
        for (const index of order) await save(operations[index]);
        await flushBackgroundTasks();

        const community = await repository.requireAtFrontier(communityId, [
          joined.getHash(),
        ]);

        expect(community?.toPrimitives().bannedMemberIds).toEqual([]);
      }
    });

    it('fails on a head this node does not hold, so the record is retried', async () => {
      await save(genesis());
      await flushBackgroundTasks();

      await expect(
        repository.requireAtFrontier(communityId, ['B'.repeat(43)]),
      ).rejects.toThrow();
    });

    it('states the invitations as they were at the frontier', async () => {
      const created = genesis();
      const invited = invitation([created]);
      const admitted = admission([invited.operation], invited, alice);
      const revoked = revoke([admitted], invited);

      for (const op of [created, invited.operation, admitted, revoked]) {
        await save(op);
      }
      await flushBackgroundTasks();

      const { community, invitations } =
        await repository.requireStateAtFrontier(communityId, [
          admitted.getHash(),
        ]);
      const stated = invitations.find(invited.operation.getHash());

      expect(community.isMember(alice)).toBe(true);
      expect(stated?.hasJoined(alice)).toBe(true);
      expect(stated?.isRevoked()).toBe(false);
    });
  });

  describe('findInvitations', () => {
    it('states the invitations of the latest state', async () => {
      const created = genesis();
      const invited = invitation([created]);
      const revoked = revoke([invited.operation], invited);

      for (const op of [created, invited.operation, revoked]) await save(op);
      await flushBackgroundTasks();

      const invitations = await repository.findInvitations(communityId);

      expect(invitations.find(invited.operation.getHash())?.isRevoked()).toBe(
        true,
      );
    });

    it('knows no invitation of an unknown community', async () => {
      const invitations = await repository.findInvitations(communityId);

      expect(invitations.list()).toEqual([]);
    });
  });

  it('lists the communities of a member and the discoverable ones', async () => {
    const created = genesis();

    await save(created);
    await save(join([created], alice));
    await flushBackgroundTasks();

    const byMember = await repository.findByMember(alice);
    const discoverable = await repository.findDiscoverable({ networkId });

    expect(byMember.map((community) => community.getId().valueOf())).toEqual([
      communityId.valueOf(),
    ]);
    expect(
      discoverable.map((community) => community.getId().valueOf()),
    ).toEqual([communityId.valueOf()]);
    await expect(repository.findByMember(mallory)).resolves.toEqual([]);
  });

  it('filters discoverable communities by network, query and exclusion', async () => {
    await save(genesis());
    await flushBackgroundTasks();

    await expect(
      repository.findDiscoverable({ networkId: 'another-network' }),
    ).resolves.toEqual([]);
    await expect(
      repository.findDiscoverable({ query: 'nothing like it' }),
    ).resolves.toEqual([]);
    await expect(
      repository.findDiscoverable({ query: 'COMMUNITY' }),
    ).resolves.toHaveLength(1);
    await expect(
      repository.findDiscoverable({}, [communityId]),
    ).resolves.toEqual([]);
  });

  it('answers not ready instead of a partial list while a community head is held', async () => {
    const created = genesis();

    await save(created);
    await save(join([created], alice));
    await flushBackgroundTasks();

    const pending = jest
      .spyOn(registry, 'hasPendingHeadAdmissions')
      .mockReturnValue(true);

    await expect(repository.findByMember(alice)).rejects.toBeInstanceOf(
      ReplicatedStateNotReadyError,
    );
    await expect(
      repository.findDiscoverable({ networkId }),
    ).rejects.toBeInstanceOf(ReplicatedStateNotReadyError);

    pending.mockReturnValue(false);

    const byMember = await repository.findByMember(alice);
    const discoverable = await repository.findDiscoverable({ networkId });

    expect(byMember.map((community) => community.getId().valueOf())).toEqual([
      communityId.valueOf(),
    ]);
    expect(
      discoverable.map((community) => community.getId().valueOf()),
    ).toEqual([communityId.valueOf()]);
  });

  it('forgets a community once its last member left', async () => {
    const created = genesis();
    const left = operation(
      CommunityOperationAction.MEMBER_LEFT,
      owner,
      { identityId: owner.valueOf() },
      [created],
    );

    await save(created);
    await save(left);
    await flushBackgroundTasks();

    await expect(repository.hasById(communityId)).resolves.toBe(false);
    await expect(repository.findByMember(owner)).resolves.toEqual([]);
    await expect(repository.findDiscoverable({})).resolves.toEqual([]);
  });

  it('ignores a stored record whose operation does not hold together', async () => {
    const created = genesis();

    await save(created);
    await flushBackgroundTasks();

    const key = `community-operation-index:${communityId.valueOf()}`;
    const head = heads.get(key) as {
      communityOperations: Record<string, unknown>[];
    };
    const [record] = head.communityOperations;

    heads.set(key, {
      ...head,
      communityOperations: [{ ...record, authorIdentityId: 'not-an-identity' }],
    });
    registry.clear();
    await registry.register(networkId, storesOf());

    await expect(repository.hasById(communityId)).resolves.toBe(false);
  });

  it('never lets a community that became protected take public operations', async () => {
    hasScope.mockResolvedValue(true);

    await expect(save(genesis())).rejects.toBeInstanceOf(
      InvalidPrivateAuthorizationError,
    );
    expect(documents).toHaveLength(0);
  });

  it('keeps communities of other ids apart', async () => {
    const created = genesis();

    await save(created);
    await flushBackgroundTasks();

    await expect(
      repository.hasById(new CommunityId('another-community')),
    ).resolves.toBe(false);
  });

  async function save(operationToSave: CommunityOperation): Promise<void> {
    await repository.save(operationToSave, await proofOf(operationToSave));
  }

  function storesOf(): never {
    return {
      communityOperations: {
        put: jest.fn((document) => {
          upsertDocument(documents, document);

          return 'ok';
        }),
        query: jest.fn((matcher) => documents.filter(matcher)),
      },
      heads: {
        get: jest.fn((key: string) => {
          const value = heads.get(key);

          return value ? { key, value } : undefined;
        }),
        put: jest.fn((key: string, value: Record<string, unknown>) => {
          heads.set(key, value);

          return 'ok';
        }),
      },
    } as never;
  }
});

function proofOf(operation: CommunityOperation): Promise<PublicMutationProof> {
  return signedMutation({
    identityId: operation.getAuthorIdentityId().valueOf(),
    kind: 'put',
    payload: operation.toPrimitives() as unknown as Record<string, unknown>,
    recordId: operation.getId(),
    sequence: 0,
    store: 'communityOperations',
  });
}

function flushBackgroundTasks(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();

  setImmediate(resolve);

  return promise;
}

function upsertDocument(
  currentDocuments: Record<string, unknown>[],
  newDocument: Record<string, unknown>,
): void {
  const existingIndex = currentDocuments.findIndex(
    (candidate) => candidate.id === newDocument.id,
  );

  if (existingIndex === -1) {
    currentDocuments.push(newDocument);

    return;
  }

  currentDocuments.splice(existingIndex, 1, newDocument);
}
