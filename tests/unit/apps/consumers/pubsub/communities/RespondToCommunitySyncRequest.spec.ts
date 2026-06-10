import RespondToCommunitySyncRequest from '@app/apps/consumers/pubsub/communities/RespondToCommunitySyncRequest';
import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityChannelMessage } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessage';
import { CommunityChannelMessageReaction } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessageReaction';
import { CommunitySyncAvailableEvent } from '@app/contexts/communities/domain/events/CommunitySyncAvailableEvent';
import { CommunitySyncRequestedEvent } from '@app/contexts/communities/domain/events/CommunitySyncRequestedEvent';
import MongoCommunityMessageReactionRepository from '@app/contexts/communities/infrastructure/mongo/MongoCommunityChannelMessageReactionRepository';
import MongoCommunityChannelMessageRepository from '@app/contexts/communities/infrastructure/mongo/MongoCommunityChannelMessageRepository';
import MongoCommunityRepository from '@app/contexts/communities/infrastructure/mongo/MongoCommunityRepository';
import SyncResponseSuppressionTracker from '@app/contexts/shared/application/sync/SyncResponseSuppressionTracker';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('RespondToCommunitySyncRequest', () => {
  const communityId = 'community-1';
  const networkId = '550e8400-e29b-41d4-a716-446655440001';
  const encryptedMessageId = 'encrypted-message';
  const plaintextMessageId = 'plaintext-message';

  let communityRepository: MockProxy<MongoCommunityRepository>;
  let eventConsumer: MockProxy<DomainEventConsumer>;
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let messageRepository: MockProxy<MongoCommunityChannelMessageRepository>;
  let reactionRepository: MockProxy<MongoCommunityMessageReactionRepository>;
  let tracker: MockProxy<SyncResponseSuppressionTracker>;
  let consumer: RespondToCommunitySyncRequest;
  let ownerIdentityId: string;
  let signature: string;

  beforeEach(() => {
    communityRepository = mock<MongoCommunityRepository>();
    eventConsumer = mock<DomainEventConsumer>();
    eventPublisher = mock<DomainEventPublisher>();
    messageRepository = mock<MongoCommunityChannelMessageRepository>();
    reactionRepository = mock<MongoCommunityMessageReactionRepository>();
    tracker = mock<SyncResponseSuppressionTracker>();
    const identityMother = new IdentityMother();

    ownerIdentityId = identityMother.id.valueOf();
    signature = identityMother.signature.valueOf();
    tracker.shouldRespond.mockResolvedValue(true);
    consumer = new RespondToCommunitySyncRequest(
      eventConsumer,
      communityRepository,
      messageRepository,
      reactionRepository,
      eventPublisher,
      tracker,
    );
  });

  function community(): Community {
    return Community.fromPrimitives({
      autoJoinEnabled: false,
      avatar: undefined,
      bannedMemberIds: [],
      banner: undefined,
      createdAt: 1778513696020,
      description: 'Community description',
      discoverable: true,
      id: communityId,
      memberIds: [ownerIdentityId],
      memberRoles: [],
      name: 'Community',
      networkId,
      ownerIdentityId,
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

  function message(
    id: string,
    payload: { encryptedPayload?: string; plaintextPayload?: string },
  ): CommunityChannelMessage {
    return CommunityChannelMessage.fromPrimitives({
      attachmentExternalIdentifiers: [],
      authorIdentityId: ownerIdentityId,
      channelId: 'channel-1',
      communityId,
      createdAt: 1778513696020,
      editedAt: undefined,
      encryptedPayload: payload.encryptedPayload,
      id,
      mentions: [],
      plaintextPayload: payload.plaintextPayload,
      pollId: undefined,
      replyToMessageId: undefined,
      signature,
      type: 'sent',
    });
  }

  function reaction(messageId: string): CommunityChannelMessageReaction {
    return CommunityChannelMessageReaction.fromPrimitives({
      authorIdentityId: ownerIdentityId,
      channelId: 'channel-1',
      communityId,
      createdAt: 1778513696020,
      emoji: '👍',
      messageId,
    });
  }

  it('does not publish plaintext message candidates in community sync responses', async () => {
    communityRepository.findById.mockResolvedValue(community());
    messageRepository.findSyncableByCommunity.mockResolvedValue([
      message(encryptedMessageId, { encryptedPayload: 'encrypted-payload' }),
    ]);
    reactionRepository.findByCommunity.mockResolvedValue([
      reaction(encryptedMessageId),
      reaction(plaintextMessageId),
    ]);

    await consumer.handler(
      new CommunitySyncRequestedEvent(communityId, {
        communityId,
        networkId,
        requestId: 'request-1',
      }),
    );

    expect(eventPublisher.publish).toHaveBeenCalledWith([
      expect.any(CommunitySyncAvailableEvent),
    ]);
    expect(eventPublisher.publish.mock.calls[0][0][0].attributes).toMatchObject(
      {
        messageCandidates: [
          expect.objectContaining({
            encryptedPayload: 'encrypted-payload',
            id: encryptedMessageId,
          }),
        ],
        reactionCandidates: [
          expect.objectContaining({ messageId: encryptedMessageId }),
        ],
      },
    );
  });
});
