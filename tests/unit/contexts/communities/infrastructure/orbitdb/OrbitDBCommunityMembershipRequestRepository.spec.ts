import { CommunityMembershipRequest } from '@app/contexts/communities/domain/entities/membership/CommunityMembershipRequest';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import OrbitDBCommunityMembershipRequestMapper from '@app/contexts/communities/infrastructure/orbitdb/mappers/OrbitDBCommunityMembershipRequestMapper';
import OrbitDBCommunityMembershipRequestRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityMembershipRequestRepository';
import PrivateCommunityPublicStorageGuard from '@app/contexts/communities/infrastructure/PrivateCommunityPublicStorageGuard';
import PrivateAuthorizationStorageCoordinator from '@app/contexts/private-authorization/infrastructure/PrivateAuthorizationStorageCoordinator';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

import { signedMutation } from '../../../public-mutations/support/signedMutation';

const publicStorageGuard = () =>
  new PrivateCommunityPublicStorageGuard(
    {
      findScope: jest.fn().mockResolvedValue(undefined),
    } as never,
    new PrivateAuthorizationStorageCoordinator(),
  );

describe('OrbitDBCommunityMembershipRequestRepository', () => {
  const createdAt = new Timestamp(1780000000000);
  const proofOf = (request: CommunityMembershipRequest, sequence = 1) =>
    signedMutation({
      identityId: request.getCreatorIdentityId().valueOf(),
      kind: 'put',
      recordId: request.getId().valueOf(),
      sequence,
      store: 'requests',
    });

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
  let requestsPut: jest.Mock;
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
    requestsPut = jest.fn(async (document) => {
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
        put: requestsPut,
        query: jest.fn(async (matcher) => requests.filter(matcher)),
      },
    } as never);
    store = new OrbitDBCommunityMembershipRequestRepository(
      registry,
      new OrbitDBCommunityMembershipRequestMapper(),
      publicStorageGuard(),
    );
  });

  it('should save and query community membership requests', async () => {
    const request = CommunityMembershipRequest.invitation(
      communityId,
      ownerIdentityId,
      invitedIdentityId,
      createdAt,
      ownerIdentityId,
    );

    await registry.putHead(`community:${communityId.valueOf()}`, {
      id: communityId.valueOf(),
      networkId: 'network-1',
      ownerIdentityId: ownerIdentityId.valueOf(),
    });
    await store.save(request, await proofOf(request));
    await flushBackgroundTasks();

    const byId = await store.findById(request.getId());
    const byIdentity = await store.findByIdentity(invitedIdentityId);
    const byCommunityAndIdentity = await store.findByCommunityAndIdentity(
      communityId,
      invitedIdentityId,
    );
    const byOwnedCommunity =
      await store.findByOwnedCommunities(ownerIdentityId);

    expect(byId?.toPrimitives()).toEqual(request.toPrimitives());
    expect(byIdentity).toHaveLength(1);
    expect(byCommunityAndIdentity).toHaveLength(1);
    expect(byOwnedCommunity).toHaveLength(1);
  });

  it('does not project a membership request when its document write fails', async () => {
    const request = CommunityMembershipRequest.invitation(
      communityId,
      ownerIdentityId,
      invitedIdentityId,
      createdAt,
      ownerIdentityId,
    );
    requestsPut.mockRejectedValueOnce(new Error('document write failed'));

    await expect(store.save(request, await proofOf(request))).rejects.toThrow(
      'document write failed',
    );
    await flushBackgroundTasks();

    await expect(store.findById(request.getId())).resolves.toBeUndefined();
    await expect(store.findByIdentity(invitedIdentityId)).resolves.toEqual([]);
    expect(
      heads.has(`community-membership-request:${request.getId().valueOf()}`),
    ).toBe(false);
  });

  it('keeps the previous state when a resolution write fails', async () => {
    const request = CommunityMembershipRequest.invitation(
      communityId,
      ownerIdentityId,
      invitedIdentityId,
      createdAt,
      ownerIdentityId,
    );
    await store.save(request, await proofOf(request));
    await flushBackgroundTasks();
    request.accept(
      invitedIdentityId,
      ownerIdentityId,
      new Timestamp(createdAt.valueOf() + 1),
    );
    requestsPut.mockRejectedValueOnce(new Error('resolution write failed'));

    await expect(
      store.save(request, await proofOf(request, 2)),
    ).rejects.toThrow('resolution write failed');
    await flushBackgroundTasks();

    const found = await store.findById(request.getId());

    expect(found?.toPrimitives().status).toBe('pending');
  });

  it('should find membership requests from fresh heads when identity indexes lag', async () => {
    const request = CommunityMembershipRequest.invitation(
      communityId,
      ownerIdentityId,
      invitedIdentityId,
      createdAt,
      ownerIdentityId,
    );

    await registry.putHead(`community:${communityId.valueOf()}`, {
      id: communityId.valueOf(),
      networkId: 'network-1',
      ownerIdentityId: ownerIdentityId.valueOf(),
    });
    await store.save(request, await proofOf(request));
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
      createdAt,
      ownerIdentityId,
    );

    await registry.putHead(`community:${communityId.valueOf()}`, {
      id: communityId.valueOf(),
      networkId: 'network-1',
      ownerIdentityId: ownerIdentityId.valueOf(),
    });
    await store.save(request, await proofOf(request));
    heads.delete(
      `community-membership-request-identity-index:${invitedIdentityId.valueOf()}`,
    );
    const replicatedStore = new OrbitDBCommunityMembershipRequestRepository(
      registry,
      new OrbitDBCommunityMembershipRequestMapper(),
      publicStorageGuard(),
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
      createdAt,
      ownerIdentityId,
    );

    await registry.putHead(`community:${communityId.valueOf()}`, {
      id: communityId.valueOf(),
      networkId: 'network-1',
      ownerIdentityId: ownerIdentityId.valueOf(),
    });
    await store.save(request, await proofOf(request));
    heads.delete(
      `community-membership-request-identity-index:${ownerIdentityId.valueOf()}`,
    );

    const byCreator = await store.findByIdentity(ownerIdentityId);

    expect(byCreator.map((item) => item.getId().valueOf())).toEqual([
      request.getId().valueOf(),
    ]);
  });
});

function flushBackgroundTasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
