import CommunityNetworkSyncResponder from '@app/contexts/communities/application/respond-network-sync/CommunityNetworkSyncResponder';
import { CommunityNetworkSyncResponseMessage } from '@app/contexts/communities/application/respond-network-sync/messages/CommunityNetworkSyncResponseMessage';
import { CommunitySyncAvailableEvent } from '@app/contexts/communities/domain/events/CommunitySyncAvailableEvent';
import { Community } from '@app/contexts/communities/domain/Community';
import { MongoCommunityRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityRepository';
import SyncResponseSuppressionTracker from '@app/contexts/shared/application/sync/SyncResponseSuppressionTracker';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('CommunityNetworkSyncResponder', () => {
  const networkId = '550e8400-e29b-41d4-a716-446655440001';

  let communityRepository: MockProxy<MongoCommunityRepository>;
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let tracker: MockProxy<SyncResponseSuppressionTracker>;
  let responder: CommunityNetworkSyncResponder;

  beforeEach(() => {
    communityRepository = mock<MongoCommunityRepository>();
    eventPublisher = mock<DomainEventPublisher>();
    tracker = mock<SyncResponseSuppressionTracker>();
    tracker.shouldRespond.mockResolvedValue(true);
    responder = new CommunityNetworkSyncResponder(
      communityRepository,
      eventPublisher,
      tracker,
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

  it('should announce community metadata without message candidates', async () => {
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
    expect(eventPublisher.publish).toHaveBeenCalledWith([
      expect.any(CommunitySyncAvailableEvent),
      expect.any(CommunitySyncAvailableEvent),
    ]);
    const attributes = eventPublisher.publish.mock.calls[0][0][0].attributes;

    expect(attributes).toMatchObject({
      community: expect.objectContaining({ id: 'community-1' }),
      communityId: 'community-1',
      networkId,
      requestId: 'request-1',
    });
    expect(attributes).not.toHaveProperty('messageCandidates');
    expect(attributes).not.toHaveProperty('reactionCandidates');
  });
});
