import CommunityNetworkSyncResponder from '@app/contexts/communities/application/respond-network-sync/CommunityNetworkSyncResponder';
import { CommunityNetworkSyncResponseMessage } from '@app/contexts/communities/application/respond-network-sync/messages/CommunityNetworkSyncResponseMessage';
import CommunitySyncResponder from '@app/contexts/communities/application/respond-sync/CommunitySyncResponder';
import { Community } from '@app/contexts/communities/domain/Community';
import { MongoCommunityRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityRepository';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('CommunityNetworkSyncResponder', () => {
  const networkId = '550e8400-e29b-41d4-a716-446655440001';

  let communityRepository: MockProxy<MongoCommunityRepository>;
  let communitySyncResponder: MockProxy<CommunitySyncResponder>;
  let responder: CommunityNetworkSyncResponder;

  beforeEach(() => {
    communityRepository = mock<MongoCommunityRepository>();
    communitySyncResponder = mock<CommunitySyncResponder>();
    responder = new CommunityNetworkSyncResponder(
      communityRepository,
      communitySyncResponder,
    );
  });

  function community(id: string): Community {
    const identityMother = new IdentityMother();

    return Community.fromPrimitives({
      autoJoinEnabled: false,
      avatar: undefined,
      bannedMemberIds: [],
      banner: undefined,
      createdAt: 1778513696020,
      description: 'Community description',
      discoverable: true,
      id,
      memberIds: [identityMother.id.valueOf()],
      memberRoles: [],
      name: 'Community',
      networkId,
      ownerIdentityId: identityMother.id.valueOf(),
      roles: [
        {
          builtIn: true,
          id: 'everyone',
          name: 'everyone',
          permissions: [
            'attach_files',
            'connect_voice',
            'embed_links',
            'send_messages',
            'send_stickers',
            'view_channels',
          ],
        },
      ],
      textChannels: [],
      visibility: 'public',
      voiceChannels: [],
    });
  }

  it('should request sync candidates for every community in the network', async () => {
    communityRepository.findByNetworkId.mockResolvedValue([
      community('community-1'),
      community('community-2'),
    ]);

    await responder.respond(
      new CommunityNetworkSyncResponseMessage(networkId, 'request-1'),
    );

    expect(communityRepository.findByNetworkId).toHaveBeenCalledWith(
      expect.objectContaining({
        valueOf: expect.any(Function),
      }),
      100,
    );
    expect(communitySyncResponder.respond).toHaveBeenCalledTimes(2);
    expect(
      communitySyncResponder.respond.mock.calls[0][0].communityId.valueOf(),
    ).toBe('community-1');
    expect(
      communitySyncResponder.respond.mock.calls[1][0].communityId.valueOf(),
    ).toBe('community-2');
  });
});
