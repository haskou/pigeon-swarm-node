import LocalPrivateCommunityRepository from '@app/contexts/communities/infrastructure/local-db/LocalPrivateCommunityRepository';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivateAuthorizationRepository } from '@app/contexts/private-authorization/domain/repositories/PrivateAuthorizationRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { generateKeyPairSync } from 'node:crypto';

describe('LocalPrivateCommunityRepository', () => {
  const authorization = {
    findProjection: jest.fn(),
    findScopeIds: jest.fn(),
  } as unknown as jest.Mocked<PrivateAuthorizationRepository>;
  const repository = new LocalPrivateCommunityRepository(authorization);

  beforeEach(() => jest.clearAllMocks());

  it('returns no community when the local private projection is absent', async () => {
    authorization.findProjection.mockResolvedValue(undefined);

    await expect(
      repository.findById(new CommunityId('protected')),
    ).resolves.toBeUndefined();
  });

  it('fails closed when the private projection is malformed', async () => {
    authorization.findProjection.mockResolvedValue({ id: 'protected' });

    await expect(
      repository.findById(new CommunityId('protected')),
    ).rejects.toBeInstanceOf(InvalidPrivateAuthorizationError);
  });

  it('lists only protected projections containing the requested member', async () => {
    const identityId = validIdentityId();
    const otherIdentityId = validIdentityId();
    authorization.findScopeIds.mockResolvedValue([
      'member-community',
      'other-community',
    ]);
    authorization.findProjection.mockImplementation((scopeId) =>
      Promise.resolve(
        projection(
          scopeId,
          scopeId === 'member-community'
            ? [identityId.valueOf()]
            : [otherIdentityId.valueOf()],
        ),
      ),
    );

    const result = await repository.findByMember(identityId);

    expect(result.map((community) => community.getId().valueOf())).toEqual([
      'member-community',
    ]);
  });

  it('fails closed when a projection is stored under another scope identifier', async () => {
    const identityId = validIdentityId();
    authorization.findProjection.mockResolvedValue(
      projection('different-community', [identityId.valueOf()]),
    );

    await expect(
      repository.findById(new CommunityId('protected')),
    ).rejects.toBeInstanceOf(InvalidPrivateAuthorizationError);
  });
});

function projection(id: string, memberIds: string[]): Record<string, unknown> {
  return {
    autoJoinEnabled: false,
    bannedMemberIds: [],
    createdAt: 1,
    description: 'Private community',
    discoverable: false,
    id,
    memberIds,
    memberRoles: [],
    name: 'Private',
    networkId: '550e8400-e29b-41d4-a716-446655440000',
    ownerIdentityId: memberIds[0] ?? 'owner',
    roles: [],
    textChannels: [],
    visibility: 'private',
    voiceChannels: [],
  };
}

function validIdentityId(): IdentityId {
  return new IdentityId(
    generateKeyPairSync('ed25519')
      .publicKey.export({
        format: 'pem',
        type: 'spki',
      })
      .toString(),
  );
}
