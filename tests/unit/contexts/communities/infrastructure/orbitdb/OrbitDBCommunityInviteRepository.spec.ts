import { CommunityInvite } from '@app/contexts/communities/domain/entities/invites/CommunityInvite';
import { CommunityInviteMaxUses } from '@app/contexts/communities/domain/value-objects/CommunityInviteMaxUses';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import OrbitDBCommunityInviteMapper from '@app/contexts/communities/infrastructure/orbitdb/mappers/OrbitDBCommunityInviteMapper';
import OrbitDBCommunityInviteRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityInviteRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

describe('OrbitDBCommunityInviteRepository', () => {
  const communityId = new CommunityId('community-1');
  const creatorIdentityId = new IdentityId(
    'MCowBQYDK2VwAyEAj3dYus5qe3I0IrvPl/oEM+678lbO9+1vzJSlXnlb0v4=',
  );
  const documents: Record<string, unknown>[] = [];
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBCommunityInviteRepository;

  beforeEach(() => {
    documents.splice(0);
    registry = new OrbitDBReplicatedStateRegistry();
    registry.register('network-1', {
      requests: {
        put: jest.fn(async (document) => {
          const record = document as Record<string, unknown>;
          const index = documents.findIndex(
            (candidate) => candidate.id === record.id,
          );

          if (index >= 0) {
            documents[index] = record;
          } else {
            documents.push(record);
          }

          return 'ok';
        }),
        query: jest.fn(async (matcher) => documents.filter(matcher)),
      },
    } as never);
    repository = new OrbitDBCommunityInviteRepository(
      registry,
      new OrbitDBCommunityInviteMapper(),
    );
  });

  it('should save, consume and tombstone community invite links', async () => {
    const invite = CommunityInvite.create(
      communityId,
      creatorIdentityId,
      undefined,
      new CommunityInviteMaxUses(2),
    );

    await repository.save(invite);

    const found = await repository.findByToken(invite.getToken());
    const consumed = await repository.consume(invite);

    await repository.deleteByCommunity(communityId);

    const deleted = await repository.findByToken(invite.getToken());

    expect(found?.toPrimitives()).toEqual(invite.toPrimitives());
    expect(consumed.toPrimitives()).toEqual({
      ...invite.toPrimitives(),
      uses: 1,
    });
    expect(deleted).toBeUndefined();
  });
});
