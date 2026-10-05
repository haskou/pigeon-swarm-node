import { Timestamp } from '@haskou/value-objects';
import { signedMutation } from '../../../public-mutations/support/signedMutation';
import { CommunityInviteNonce } from '@app/contexts/communities/domain/value-objects/CommunityInviteNonce';
import { CommunityInvite } from '@app/contexts/communities/domain/entities/invites/CommunityInvite';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityInviteMaxUses } from '@app/contexts/communities/domain/value-objects/CommunityInviteMaxUses';
import OrbitDBCommunityInviteMapper from '@app/contexts/communities/infrastructure/orbitdb/mappers/OrbitDBCommunityInviteMapper';
import OrbitDBCommunityInviteRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityInviteRepository';
import PrivateCommunityPublicStorageGuard from '@app/contexts/communities/infrastructure/PrivateCommunityPublicStorageGuard';
import PrivateAuthorizationStorageCoordinator from '@app/contexts/private-authorization/infrastructure/PrivateAuthorizationStorageCoordinator';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

const publicStorageGuard = () =>
  new PrivateCommunityPublicStorageGuard(
    {
      findScope: jest.fn().mockResolvedValue(undefined),
    } as never,
    new PrivateAuthorizationStorageCoordinator(),
  );

describe('OrbitDBCommunityInviteRepository', () => {
  const communityId = new CommunityId('community-1');
  const creatorIdentityId = new IdentityId(
    'MCowBQYDK2VwAyEAj3dYus5qe3I0IrvPl/oEM+678lbO9+1vzJSlXnlb0v4=',
  );
  const otherIdentityId = new IdentityId(
    'MCowBQYDK2VwAyEAVqz7Fhhakf52gpEbnr//2PWqXYG/RqMhUUe5SE1h1XA=',
  );
  const documents: Record<string, unknown>[] = [];
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBCommunityInviteRepository;

  beforeEach(() => {
    documents.splice(0);
    registry = new OrbitDBReplicatedStateRegistry();
    registry.register('network-1', {
      heads: {
        all: jest.fn(async (): Promise<[]> => []),
        get: jest.fn(async (): Promise<undefined> => undefined),
        put: jest.fn(async () => 'ok'),
      },
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
      publicStorageGuard(),
    );
  });

  it('should save community invite links and count their signed uses', async () => {
    const createdAt = new Timestamp(1780000000000);
    const invite = CommunityInvite.create(
      communityId,
      creatorIdentityId,
      new CommunityInviteNonce('nonce-0123456789abcdef'),
      createdAt,
      undefined,
      new CommunityInviteMaxUses(2),
    );
    const token = invite.getToken().valueOf();

    await repository.save(
      invite,
      await signedMutation({
        identityId: creatorIdentityId.valueOf(),
        kind: 'put',
        recordId: token,
        sequence: 1,
        store: 'requests',
      }),
    );
    const found = await repository.findByToken(invite.getToken());
    const before = await repository.countUses(invite);

    for (const identityId of [creatorIdentityId, otherIdentityId]) {
      await repository.recordUse(
        invite,
        identityId,
        createdAt,
        await signedMutation({
          identityId: identityId.valueOf(),
          kind: 'put',
          recordId: `invite-use:${token}:${identityId.valueOf()}`,
          sequence: 1,
          store: 'requests',
        }),
      );
    }

    expect(found?.toPrimitives()).toEqual(invite.toPrimitives());
    expect(before.valueOf()).toBe(0);
    expect((await repository.countUses(invite)).valueOf()).toBe(2);
  });
});
