import { CommunityMembershipRequest } from '@app/contexts/communities/domain/entities/membership/CommunityMembershipRequest';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import OrbitDBCommunityMembershipRequestMapper from '@app/contexts/communities/infrastructure/orbitdb/mappers/OrbitDBCommunityMembershipRequestMapper';
import OrbitDBCommunityMembershipRequestRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityMembershipRequestRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

describe('OrbitDBCommunityMembershipRequestRepository', () => {
  const communityId = new CommunityId('community-1');
  const ownerIdentityId = new IdentityId(
    'MCowBQYDK2VwAyEAj3dYus5qe3I0IrvPl/oEM+678lbO9+1vzJSlXnlb0v4=',
  );
  const invitedIdentityId = new IdentityId(
    'MCowBQYDK2VwAyEARcVr0970Zu0KPAIPEEvpy9RjsnM05VnDmccfWloMx8k=',
  );
  const communities: Record<string, unknown>[] = [];
  const heads = new Map<string, Record<string, unknown>>();
  const requests: Record<string, unknown>[] = [];
  let headsPut: jest.Mock;
  let registry: OrbitDBReplicatedStateRegistry;
  let store: OrbitDBCommunityMembershipRequestRepository;

  beforeEach(() => {
    communities.splice(0);
    heads.clear();
    requests.splice(0);
    headsPut = jest.fn(async (key: string, value: Record<string, unknown>) => {
      heads.set(key, value);

      return 'ok';
    });
    registry = new OrbitDBReplicatedStateRegistry();
    registry.register('network-1', {
      communities: {
        put: jest.fn(async (document) => {
          communities.push(document as Record<string, unknown>);

          return 'ok';
        }),
        query: jest.fn(async (matcher) => communities.filter(matcher)),
      },
      heads: {
        all: jest.fn(async () =>
          [...heads.entries()].map(([key, value]) => ({ key, value })),
        ),
        get: jest.fn(async (key: string) => {
          const value = heads.get(key);

          return value ? { key, value } : undefined;
        }),
        put: headsPut,
      },
      requests: {
        put: jest.fn(async (document) => {
          const record = document as Record<string, unknown>;
          const index = requests.findIndex(
            (candidate) => candidate.id === record.id,
          );

          if (index >= 0) {
            requests[index] = record;
          } else {
            requests.push(record);
          }

          return 'ok';
        }),
        query: jest.fn(async (matcher) => requests.filter(matcher)),
      },
    } as never);
    store = new OrbitDBCommunityMembershipRequestRepository(
      registry,
      new OrbitDBCommunityMembershipRequestMapper(),
    );
  });

  it('should save, query and tombstone community membership requests', async () => {
    const request = CommunityMembershipRequest.invitation(
      communityId,
      ownerIdentityId,
      invitedIdentityId,
      ownerIdentityId,
    );

    await registry.putHead(`community:${communityId.valueOf()}`, {
      id: communityId.valueOf(),
      networkId: 'network-1',
      ownerIdentityId: ownerIdentityId.valueOf(),
    });
    await store.save(request);
    await flushBackgroundTasks();

    const byId = await store.findById(request.getId());
    const byIdentity = await store.findByIdentity(invitedIdentityId);
    const byCommunityAndIdentity = await store.findByCommunityAndIdentity(
      communityId,
      invitedIdentityId,
    );
    const byOwnedCommunity =
      await store.findByOwnedCommunities(ownerIdentityId);

    await store.deleteByCommunity(communityId);

    const afterDelete = await store.findByIdentity(invitedIdentityId);

    expect(byId?.toPrimitives()).toEqual(request.toPrimitives());
    expect(byIdentity).toHaveLength(1);
    expect(byCommunityAndIdentity).toHaveLength(1);
    expect(byOwnedCommunity).toHaveLength(1);
    expect(afterDelete).toHaveLength(0);
  });

  it('should not wait for secondary indexes when saving membership requests', async () => {
    const request = CommunityMembershipRequest.invitation(
      communityId,
      ownerIdentityId,
      invitedIdentityId,
      ownerIdentityId,
    );

    await registry.putHead(`community:${communityId.valueOf()}`, {
      id: communityId.valueOf(),
      networkId: 'network-1',
      ownerIdentityId: ownerIdentityId.valueOf(),
    });
    headsPut.mockImplementation(
      async (key: string, value: Record<string, unknown>) => {
        if (!key.startsWith('community-membership-request:')) {
          return new Promise(() => undefined);
        }

        heads.set(key, value);

        return 'ok';
      },
    );

    const result = await Promise.race([
      store.save(request).then(() => 'saved'),
      new Promise((resolve) => setTimeout(() => resolve('blocked'), 10)),
    ]);

    expect(result).toBe('saved');
    expect(
      heads.get(`community-membership-request:${request.getId().valueOf()}`),
    ).toEqual(expect.objectContaining({ id: request.getId().valueOf() }));
  });

  it('should find membership requests from fresh heads when identity indexes lag', async () => {
    const request = CommunityMembershipRequest.invitation(
      communityId,
      ownerIdentityId,
      invitedIdentityId,
      ownerIdentityId,
    );

    await registry.putHead(`community:${communityId.valueOf()}`, {
      id: communityId.valueOf(),
      networkId: 'network-1',
      ownerIdentityId: ownerIdentityId.valueOf(),
    });
    await store.save(request);
    heads.delete(
      `community-membership-request-identity-index:${invitedIdentityId.valueOf()}`,
    );

    const byIdentity = await store.findByIdentity(invitedIdentityId);

    expect(byIdentity.map((item) => item.getId().valueOf())).toEqual([
      request.getId().valueOf(),
    ]);
  });

  it('should find cached membership request heads from another repository when indexes lag', async () => {
    const request = CommunityMembershipRequest.invitation(
      communityId,
      ownerIdentityId,
      invitedIdentityId,
      ownerIdentityId,
    );

    await registry.putHead(`community:${communityId.valueOf()}`, {
      id: communityId.valueOf(),
      networkId: 'network-1',
      ownerIdentityId: ownerIdentityId.valueOf(),
    });
    await store.save(request);
    heads.delete(
      `community-membership-request-identity-index:${invitedIdentityId.valueOf()}`,
    );
    const replicatedStore = new OrbitDBCommunityMembershipRequestRepository(
      registry,
      new OrbitDBCommunityMembershipRequestMapper(),
    );

    const byIdentity = await replicatedStore.findByIdentity(invitedIdentityId);

    expect(byIdentity.map((item) => item.getId().valueOf())).toEqual([
      request.getId().valueOf(),
    ]);
  });

  it('should find membership requests from fresh heads by creator when identity indexes lag', async () => {
    const request = CommunityMembershipRequest.invitation(
      communityId,
      ownerIdentityId,
      invitedIdentityId,
      ownerIdentityId,
    );

    await registry.putHead(`community:${communityId.valueOf()}`, {
      id: communityId.valueOf(),
      networkId: 'network-1',
      ownerIdentityId: ownerIdentityId.valueOf(),
    });
    await store.save(request);
    heads.delete(
      `community-membership-request-identity-index:${ownerIdentityId.valueOf()}`,
    );

    const byCreator = await store.findByIdentity(ownerIdentityId);

    expect(byCreator.map((item) => item.getId().valueOf())).toEqual([
      request.getId().valueOf(),
    ]);
  });

  it('should not return deleted membership requests from stale indexes', async () => {
    const request = CommunityMembershipRequest.invitation(
      communityId,
      ownerIdentityId,
      invitedIdentityId,
      ownerIdentityId,
    );
    const communityIndexKey = `community-membership-request-community-index:${communityId.valueOf()}`;
    const identityIndexKey = `community-membership-request-identity-index:${invitedIdentityId.valueOf()}`;

    await registry.putHead(`community:${communityId.valueOf()}`, {
      id: communityId.valueOf(),
      networkId: 'network-1',
      ownerIdentityId: ownerIdentityId.valueOf(),
    });
    await store.save(request);
    await flushBackgroundTasks();
    const staleCommunityIndex = heads.get(communityIndexKey);
    const staleIdentityIndex = heads.get(identityIndexKey);

    await store.deleteByCommunity(communityId);

    if (staleCommunityIndex) {
      heads.set(communityIndexKey, staleCommunityIndex);
    }

    if (staleIdentityIndex) {
      heads.set(identityIndexKey, staleIdentityIndex);
    }

    const byIdentity = await store.findByIdentity(invitedIdentityId);
    const byCommunityAndIdentity = await store.findByCommunityAndIdentity(
      communityId,
      invitedIdentityId,
    );

    expect(byIdentity).toEqual([]);
    expect(byCommunityAndIdentity).toEqual([]);
  });
});

function flushBackgroundTasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
