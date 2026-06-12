import { mock, MockProxy } from 'jest-mock-extended';

import { Community } from '@app/contexts/communities/domain/Community';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import IdentityPresenceHeartbeatRecorder from '@app/contexts/presence/application/record-heartbeat/IdentityPresenceHeartbeatRecorder';
import { IdentityPresenceHeartbeatMessage } from '@app/contexts/presence/application/record-heartbeat/messages/IdentityPresenceHeartbeatMessage';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import WebSocketClientMessageHandler from '@app/shared/infrastructure/websocket/WebSocketClientMessageHandler';

describe('WebSocketClientMessageHandler', () => {
  let conversationRepository: MockProxy<ConversationRepository>;
  let communityRepository: MockProxy<CommunityRepository>;
  let heartbeatRecorder: MockProxy<IdentityPresenceHeartbeatRecorder>;
  let handler: WebSocketClientMessageHandler;

  beforeEach(() => {
    conversationRepository = mock<ConversationRepository>();
    communityRepository = mock<CommunityRepository>();
    heartbeatRecorder = mock<IdentityPresenceHeartbeatRecorder>();
    handler = new WebSocketClientMessageHandler(
      conversationRepository,
      communityRepository,
      heartbeatRecorder,
    );
  });

  it('should return conversation typing recipients without the sender', async () => {
    const sender = new IdentityId(
      'MCowBQYDK2VwAyEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    );
    const recipient = new IdentityId(
      'MCowBQYDK2VwAyEBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=',
    );
    const conversation = mock<Conversation>();

    conversation.hasParticipant.mockReturnValue(true);
    conversation.getParticipantIds.mockReturnValue([sender, recipient]);
    conversationRepository.findMetadataById.mockResolvedValue(conversation);

    await expect(
      handler.findConversationTypingRecipients(
        sender.valueOf(),
        'conversation-id',
      ),
    ).resolves.toEqual([recipient.valueOf()]);
  });

  it('should not return conversation recipients for non participants', async () => {
    const sender = new IdentityId(
      'MCowBQYDK2VwAyEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    );
    const conversation = mock<Conversation>();

    conversation.hasParticipant.mockReturnValue(false);
    conversationRepository.findMetadataById.mockResolvedValue(conversation);

    await expect(
      handler.findConversationTypingRecipients(
        sender.valueOf(),
        'conversation-id',
      ),
    ).resolves.toEqual([]);
  });

  it('should return community channel typing recipients visible in the channel', async () => {
    const sender = new IdentityId(
      'MCowBQYDK2VwAyEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    );
    const recipient = new IdentityId(
      'MCowBQYDK2VwAyECCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC=',
    );
    const community = mock<Community>();

    community.isMember.mockReturnValue(true);
    community.visibleMembersForTextChannel.mockReturnValue([sender, recipient]);
    communityRepository.findById.mockResolvedValue(community);

    await expect(
      handler.findCommunityChannelTypingRecipients(
        sender.valueOf(),
        'community-id',
        'channel-id',
      ),
    ).resolves.toEqual([recipient.valueOf()]);
  });

  it('should return identity update recipients from conversations and communities', async () => {
    const updatedIdentity = new IdentityId(
      'MCowBQYDK2VwAyEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    );
    const conversationRecipient = new IdentityId(
      'MCowBQYDK2VwAyEBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=',
    );
    const communityRecipient = new IdentityId(
      'MCowBQYDK2VwAyECCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC=',
    );
    const conversation = mock<Conversation>();
    const community = mock<Community>();

    conversation.getParticipantIds.mockReturnValue([
      updatedIdentity,
      conversationRecipient,
    ]);
    community.getMemberIds.mockReturnValue([
      updatedIdentity,
      conversationRecipient,
      communityRecipient,
    ]);
    conversationRepository.findByParticipant.mockResolvedValue([conversation]);
    communityRepository.findByMember.mockResolvedValue([community]);

    await expect(
      handler.findIdentityUpdateRecipients(updatedIdentity.valueOf()),
    ).resolves.toEqual([
      conversationRecipient.valueOf(),
      communityRecipient.valueOf(),
    ]);
  });

  it('should record identity heartbeat', async () => {
    const identityId =
      'MCowBQYDK2VwAyEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

    await handler.recordIdentityHeartbeat(identityId, true);

    expect(heartbeatRecorder.record).toHaveBeenCalledWith(
      new IdentityPresenceHeartbeatMessage(identityId, true),
    );
  });
});
