import PrivateCommunityGenesisAuthorizer from '@app/contexts/communities/application/apply-private-control/PrivateCommunityGenesisAuthorizer';
import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivateAuthorizationScopeId } from '@app/contexts/private-authorization/domain/value-objects/PrivateAuthorizationScopeId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { generateKeyPairSync } from 'crypto';

describe('PrivateCommunityGenesisAuthorizer', () => {
  const ownerIdentityId = generateKeyPairSync('ed25519')
    .publicKey.export({ format: 'der', type: 'spki' })
    .toString('base64');
  const projection = (): Record<string, unknown> => ({
    autoJoinEnabled: false,
    avatar: undefined,
    bannedMemberIds: [],
    banner: undefined,
    createdAt: 1,
    description: 'Protected community',
    discoverable: false,
    id: 'scope',
    memberIds: [ownerIdentityId],
    memberRoles: [],
    name: 'Protected community',
    networkId: '550e8400-e29b-41d4-a716-446655440000',
    ownerIdentityId,
    roles: [],
    textChannels: [],
    visibility: 'private',
    voiceChannels: [],
  });
  const authorizer = new PrivateCommunityGenesisAuthorizer();
  const scopeId = new PrivateAuthorizationScopeId('scope');
  const owner = new IdentityId(ownerIdentityId);

  it('normalizes a private owner-only genesis projection', () => {
    expect(authorizer.authorize(scopeId, owner, projection())).toEqual(
      projection(),
    );
  });

  it.each([
    ['another scope', { id: 'other-scope' }],
    ['another owner', { ownerIdentityId: 'other-owner' }],
    ['additional members', { memberIds: [ownerIdentityId, 'other-member'] }],
    ['public visibility', { visibility: 'public' }],
    ['discovery enabled', { discoverable: true }],
    ['automatic joins enabled', { autoJoinEnabled: true }],
  ])('rejects %s', (_label, change) => {
    expect(() =>
      authorizer.authorize(scopeId, owner, {
        ...projection(),
        ...change,
      }),
    ).toThrow(InvalidPrivateAuthorizationError);
  });
});
