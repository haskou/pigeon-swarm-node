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
  const requests: Record<string, unknown>[] = [];
  let registry: OrbitDBReplicatedStateRegistry;
  let store: OrbitDBCommunityMembershipRequestRepository;

  beforeEach(() => {
    communities.splice(0);
    requests.splice(0);
    registry = new OrbitDBReplicatedStateRegistry();
    registry.register('network-1', {
      communities: {
        put: jest.fn(async (document) => {
          communities.push(document as Record<string, unknown>);

          return 'ok';
        }),
        query: jest.fn(async (matcher) => communities.filter(matcher)),
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

    await registry.putDocument('communities', {
      id: communityId.valueOf(),
      ownerIdentityId: ownerIdentityId.valueOf(),
    });
    await store.save(request);

    const byId = await store.findById(request.getId());
    const byIdentity = await store.findByIdentity(invitedIdentityId);
    const byCommunityAndIdentity = await store.findByCommunityAndIdentity(
      communityId,
      invitedIdentityId,
    );
    const byOwnedCommunity = await store.findByOwnedCommunities(
      ownerIdentityId,
    );

    await store.deleteByCommunity(communityId);

    const afterDelete = await store.findByIdentity(invitedIdentityId);

    expect(byId?.toPrimitives()).toEqual(request.toPrimitives());
    expect(byIdentity).toHaveLength(1);
    expect(byCommunityAndIdentity).toHaveLength(1);
    expect(byOwnedCommunity).toHaveLength(1);
    expect(afterDelete).toHaveLength(0);
  });
});
