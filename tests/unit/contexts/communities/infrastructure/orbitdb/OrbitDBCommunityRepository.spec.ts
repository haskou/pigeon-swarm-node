import { CommunityOperation } from '@app/contexts/communities/domain/operations/CommunityOperation';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityOperationAction } from '@app/contexts/communities/domain/value-objects/CommunityOperationAction';
import OrbitDBCommunityRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityRepository';
import PrivateCommunityPublicStorageGuard from '@app/contexts/communities/infrastructure/PrivateCommunityPublicStorageGuard';
import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import PrivateAuthorizationStorageCoordinator from '@app/contexts/private-authorization/infrastructure/PrivateAuthorizationStorageCoordinator';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { signedMutation } from '../../../public-mutations/support/signedMutation';
import {
  alice,
  ban,
  communityId,
  genesis,
  join,
  mallory,
  operation,
  owner,
} from '../../domain/operations/CommunityOperationFixtures';

describe('OrbitDBCommunityRepository', () => {
  const networkId = genesis().getNetworkId().valueOf();
  const documents: Record<string, unknown>[] = [];
  const heads = new Map<string, Record<string, unknown>>();
  let findScope: jest.Mock;
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBCommunityRepository;

  beforeEach(async () => {
    documents.splice(0);
    heads.clear();
    findScope = jest.fn().mockResolvedValue(undefined);
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
        { findScope } as never,
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

    const community = await repository.findById(communityId);

    expect(community?.toPrimitives().memberIds.sort()).toEqual(
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

  it('knows nothing about a community without a stored operation', async () => {
    await expect(repository.findById(communityId)).resolves.toBeUndefined();
    await expect(repository.findFrontier(communityId)).resolves.toEqual([]);
    await expect(repository.findByMember(owner)).resolves.toEqual([]);
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
      states.push((await repository.findById(communityId))?.toPrimitives());
    }

    expect(states[1]).toEqual(states[0]);
    expect(states[2]).toEqual(states[0]);
    expect(states[0]?.bannedMemberIds).toEqual([alice.valueOf()]);
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

    await expect(repository.findById(communityId)).resolves.toBeUndefined();
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

    await expect(repository.findById(communityId)).resolves.toBeUndefined();
  });

  it('never lets a community that became protected take public operations', async () => {
    findScope.mockResolvedValue({});

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
      repository.findById(new CommunityId('another-community')),
    ).resolves.toBeUndefined();
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
