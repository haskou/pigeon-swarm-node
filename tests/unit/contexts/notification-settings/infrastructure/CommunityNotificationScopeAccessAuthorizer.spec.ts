import { Community } from '@app/contexts/communities/domain/Community';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { NotificationSettingScope } from '@app/contexts/notification-settings/domain/value-objects/NotificationSettingScope';
import CommunityNotificationScopeAccessAuthorizer from '@app/contexts/notification-settings/infrastructure/CommunityNotificationScopeAccessAuthorizer';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { generateKeyPairSync } from 'node:crypto';

describe('CommunityNotificationScopeAccessAuthorizer', () => {
  const identityId = validIdentityId();
  const communityId = new CommunityId('private-community');
  const channelId = new CommunityChannelId('private-channel');
  let community: jest.Mocked<Community>;
  let communityRepository: jest.Mocked<CommunityRepository>;
  let authorizer: CommunityNotificationScopeAccessAuthorizer;

  beforeEach(() => {
    community = {
      viewAsMember: jest.fn(),
      viewChannel: jest.fn(),
    } as unknown as jest.Mocked<Community>;
    communityRepository = {
      findById: jest.fn().mockResolvedValue(community),
    } as unknown as jest.Mocked<CommunityRepository>;
    authorizer = new CommunityNotificationScopeAccessAuthorizer(
      communityRepository,
    );
  });

  it('authorizes protected community membership', async () => {
    await authorizer.authorize(
      identityId,
      NotificationSettingScope.community(communityId),
    );

    expect(community.viewAsMember).toHaveBeenCalledWith(identityId);
  });

  it('authorizes protected channel visibility', async () => {
    await authorizer.authorize(
      identityId,
      NotificationSettingScope.communityChannel(communityId, channelId),
    );

    expect(community.viewChannel).toHaveBeenCalledWith(identityId, channelId);
  });

  it('rejects missing protected projections', async () => {
    communityRepository.findById.mockResolvedValue(undefined);

    await expect(
      authorizer.authorize(
        identityId,
        NotificationSettingScope.community(communityId),
      ),
    ).rejects.toThrow('Community not found');
  });
});

function validIdentityId(): IdentityId {
  return new IdentityId(
    generateKeyPairSync('ed25519')
      .publicKey.export({ format: 'pem', type: 'spki' })
      .toString(),
  );
}
