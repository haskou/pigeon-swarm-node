import { CommunityPrimitivesShape } from '@app/contexts/communities/domain/CommunityPrimitivesShape';

describe('CommunityPrimitivesShape', () => {
  const primitives = (): Record<string, unknown> => ({
    autoJoinEnabled: false,
    bannedMemberIds: [],
    createdAt: 1,
    description: 'Private community',
    discoverable: false,
    id: 'protected',
    memberIds: ['owner'],
    memberRoles: [{ identityId: 'owner', roleIds: ['admin'] }],
    name: 'Private',
    networkId: '550e8400-e29b-41d4-a716-446655440000',
    ownerIdentityId: 'owner',
    roles: [
      {
        builtIn: false,
        id: 'admin',
        name: 'Admin',
        permissions: ['manage_roles'],
      },
    ],
    textChannels: [
      {
        createdAt: 1,
        id: 'general',
        name: 'General',
        permissions: { visibleRoleIds: [] },
      },
    ],
    visibility: 'private',
    voiceChannels: [
      {
        createdAt: 1,
        id: 'call',
        name: 'Call',
        permissions: { visibleRoleIds: ['admin'] },
      },
    ],
  });

  it('accepts the primitives that a community stores', () => {
    expect(CommunityPrimitivesShape.isCommunityPrimitives(primitives())).toBe(
      true,
    );
  });

  it.each([
    ['absent', { avatar: undefined, banner: undefined }],
    ['null', { avatar: null, banner: null }],
    ['empty', { avatar: '', banner: '' }],
    ['set', { avatar: 'avatar', banner: 'banner' }],
  ])('accepts avatar and banner values that are %s', (_label, change) => {
    expect(
      CommunityPrimitivesShape.isCommunityPrimitives({
        ...primitives(),
        ...change,
      }),
    ).toBe(true);
  });

  it.each([
    ['an absent discovery flag', { discoverable: undefined }],
    ['a null discovery flag', { discoverable: null }],
    ['an absent auto-join flag', { autoJoinEnabled: undefined }],
    ['an absent visibility', { visibility: undefined }],
    ['a null visibility', { visibility: null }],
    ['an absent banned member list', { bannedMemberIds: undefined }],
    ['a null banned member list', { bannedMemberIds: null }],
    ['an absent member role list', { memberRoles: undefined }],
    ['an absent role list', { roles: undefined }],
    ['an absent voice channel list', { voiceChannels: undefined }],
    [
      'a text channel without permissions',
      { textChannels: [{ createdAt: 1, id: 'general', name: 'General' }] },
    ],
    [
      'a voice channel with empty permissions',
      {
        voiceChannels: [
          { createdAt: 1, id: 'call', name: 'Call', permissions: {} },
        ],
      },
    ],
    [
      'a channel without visible role ids',
      {
        textChannels: [
          {
            createdAt: 1,
            id: 'general',
            name: 'General',
            permissions: { visibleRoleIds: undefined },
          },
        ],
      },
    ],
  ])('accepts %s', (_label, change) => {
    expect(
      CommunityPrimitivesShape.isCommunityPrimitives({
        ...primitives(),
        ...change,
      }),
    ).toBe(true);
  });

  it('rejects values that are not records', () => {
    expect(CommunityPrimitivesShape.isCommunityPrimitives(undefined)).toBe(
      false,
    );
    expect(CommunityPrimitivesShape.isCommunityPrimitives(null)).toBe(false);
    expect(CommunityPrimitivesShape.isCommunityPrimitives([])).toBe(false);
  });

  it.each([
    ['a missing name', { name: undefined }],
    ['a non-text member id', { memberIds: [1] }],
    [
      'a member role without role ids',
      { memberRoles: [{ identityId: 'owner' }] },
    ],
    ['a falsy role collection', { roles: 0 }],
    [
      'a role with a non-boolean built-in flag',
      {
        roles: [{ builtIn: 'no', id: 'admin', name: 'Admin', permissions: [] }],
      },
    ],
    ['a missing text channel list', { textChannels: undefined }],
    [
      'a text channel with textual permissions',
      {
        textChannels: [
          {
            createdAt: 1,
            id: 'general',
            name: 'General',
            permissions: 'everyone',
          },
        ],
      },
    ],
    [
      'a channel with textual visible role ids',
      {
        textChannels: [
          {
            createdAt: 1,
            id: 'general',
            name: 'General',
            permissions: { visibleRoleIds: 'admin' },
          },
        ],
      },
    ],
    [
      'a voice channel with a textual creation time',
      {
        voiceChannels: [
          {
            createdAt: '1',
            id: 'call',
            name: 'Call',
            permissions: { visibleRoleIds: [] },
          },
        ],
      },
    ],
  ])('rejects %s', (_label, change) => {
    expect(
      CommunityPrimitivesShape.isCommunityPrimitives({
        ...primitives(),
        ...change,
      }),
    ).toBe(false);
  });
});
