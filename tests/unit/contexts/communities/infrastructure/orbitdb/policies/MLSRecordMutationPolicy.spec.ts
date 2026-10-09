import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityProfile } from '@app/contexts/communities/domain/entities/profile/CommunityProfile';
import { CommunitySettings } from '@app/contexts/communities/domain/entities/profile/CommunitySettings';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityDescription } from '@app/contexts/communities/domain/value-objects/CommunityDescription';
import { CommunityName } from '@app/contexts/communities/domain/value-objects/CommunityName';
import { MLSRecordId } from '@app/contexts/communities/domain/value-objects/MLSRecordId';
import { MLSRecordDocumentId } from '@app/contexts/communities/infrastructure/orbitdb/MLSRecordDocumentId';
import MLSRecordMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/MLSRecordMutationPolicy';
import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { mock } from 'jest-mock-extended';

const FRONTIER = ['A'.repeat(43)];

describe('MLSRecordMutationPolicy', () => {
  const owner = new IdentityId(
    'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
  );
  const member = new IdentityId(
    'MCowBQYDK2VwAyEAKV3uU7LZg0grhngWKkoR9jqZo5M3yQ2GHliIFMgdJZw=',
  );
  const outsider = new IdentityId(
    'MCowBQYDK2VwAyEAh0nCGc0kCbsCm9jJDplJCPWx6S8Ad+ydnPoLYKcO3hg=',
  );
  let community: Community;
  let policy: MLSRecordMutationPolicy;

  beforeEach(() => {
    community = Community.create(
      owner,
      new NetworkId('550e8400-e29b-41d4-a716-446655440011'),
      new CommunityProfile(
        new CommunityName('Community'),
        new CommunityDescription('Private community'),
      ),
      CommunitySettings.create(true),
    );
    community.addMember(owner, member);
    const communities = mock<CommunityRepository>();
    communities.findAtFrontier.mockResolvedValue(community);
    policy = new MLSRecordMutationPolicy(communities);
  });

  function record(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const content = {
      epoch: 3,
      groupId: community.getId().valueOf(),
      kind: 'commit',
      payload: 'AAEC',
      ...overrides,
    } as Record<string, unknown>;
    const recordId = MLSRecordId.derive(content as never).valueOf();

    return {
      authorIdentityId: owner.valueOf(),
      communityId: community.getId().valueOf(),
      createdAt: 1,
      id: MLSRecordDocumentId.of(community.getId().valueOf(), recordId),
      scopeType: 'community_mls',
      ...content,
    };
  }

  describe('expectationOf', () => {
    it('binds the proof to the record id and its author', () => {
      const value = record();

      expect(policy.expectationOf(value)).toEqual({
        authorIdentityId: owner.valueOf(),
        recordId: value.id,
        store: 'mlsRecords',
      });
    });

    it.each([
      ['a payload that does not match the id', { payload: 'AAED' }],
      ['a removed marker', { removed: true }],
      ['a commit without epoch', { epoch: undefined }],
      ['a key package with an epoch', { kind: 'key_package' }],
      ['a welcome without recipient', { kind: 'welcome' }],
      ['a payload that is not base64', { payload: 'not base64!' }],
      ['an unknown kind', { kind: 'proposal' }],
      ['an oversized payload', { payload: 'A'.repeat(262_145) }],
    ])('rejects %s', (_name, overrides) => {
      const value = record();

      expect(() => policy.expectationOf({ ...value, ...overrides })).toThrow(
        InvalidPublicMutationError,
      );
    });
  });

  describe('assertPermitted', () => {
    it('lets a member write to the community group', async () => {
      await expect(
        policy.assertPermitted(record(), member.valueOf(), false, FRONTIER),
      ).resolves.toBeUndefined();
    });

    it('rejects a non-member', async () => {
      await expect(
        policy.assertPermitted(record(), outsider.valueOf(), false, FRONTIER),
      ).rejects.toThrow();
    });

    it('rejects a banned member', async () => {
      community.banMember(owner, member);

      await expect(
        policy.assertPermitted(record(), member.valueOf(), false, FRONTIER),
      ).rejects.toThrow();
    });

    it('rejects a welcome addressed to a non-member', async () => {
      await expect(
        policy.assertPermitted(
          record({ kind: 'welcome', recipientIdentityId: outsider.valueOf() }),
          owner.valueOf(),
          false,
          FRONTIER,
        ),
      ).rejects.toThrow();
    });

    it('rejects a group of another community', async () => {
      await expect(
        policy.assertPermitted(
          record({ groupId: 'other-community' }),
          owner.valueOf(),
          false,
          FRONTIER,
        ),
      ).rejects.toThrow();
    });

    it('rejects a channel group of a channel that does not exist', async () => {
      await expect(
        policy.assertPermitted(
          record({ groupId: `${community.getId().valueOf()}:missing` }),
          owner.valueOf(),
          false,
          FRONTIER,
        ),
      ).rejects.toThrow();
    });

    it('rejects deletions: records are immutable', async () => {
      await expect(
        policy.assertPermitted(record(), owner.valueOf(), true, FRONTIER),
      ).rejects.toThrow(InvalidPublicMutationError);
    });
  });
});
