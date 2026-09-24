import CallAccessAuthorizer from '@app/contexts/calls/application/authorize-call/CallAccessAuthorizer';
import { Call } from '@app/contexts/calls/domain/Call';
import { CallScope } from '@app/contexts/calls/domain/CallScope';
import { CallNotFoundError } from '@app/contexts/calls/domain/errors/CallNotFoundError';
import { Community } from '@app/contexts/communities/domain/Community';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { mock } from 'jest-mock-extended';

const identity = new IdentityId(
  'MCowBQYDK2VwAyEAIZERRRhGaokvb3xQqMGr9Y2ble6jUd51OuZRsvW52Q4=',
);
const network = new NetworkId('550e8400-e29b-41d4-a716-446655440000');

describe('CallAccessAuthorizer', () => {
  const conversations = mock<ConversationRepository>();
  const communities = mock<CommunityRepository>();
  const authorizer = new CallAccessAuthorizer(conversations, communities);

  it('rechecks conversation membership instead of trusting a former call participant', async () => {
    const call = Call.start(
      identity,
      network,
      CallScope.conversation(new ConversationId('conversation-1')),
      [identity],
    );
    const conversation = mock<Conversation>();
    conversations.findMetadataById.mockResolvedValue(conversation);
    conversation.hasParticipant.mockReturnValue(true);
    await expect(
      authorizer.assertAccess(call, identity),
    ).resolves.toBeUndefined();
    conversation.hasParticipant.mockReturnValue(false);
    await expect(
      authorizer.assertAccess(call, identity),
    ).rejects.toBeInstanceOf(CallNotFoundError);
  });

  it('rechecks voice permissions on each access and hides a revoked or deleted channel', async () => {
    const call = Call.start(
      identity,
      network,
      CallScope.communityChannel(
        new CommunityId('community-1'),
        new CommunityChannelId('voice-1'),
      ),
      [identity],
    );
    const community = mock<Community>();
    communities.findById.mockResolvedValue(community);
    await expect(
      authorizer.assertAccess(call, identity),
    ).resolves.toBeUndefined();
    expect(community.authorizeVoiceChannelCall).toHaveBeenCalledWith(
      identity,
      new CommunityChannelId('voice-1'),
    );
    community.authorizeVoiceChannelCall.mockImplementation(() => {
      throw new Error('revoked');
    });
    await expect(
      authorizer.assertAccess(call, identity),
    ).rejects.toBeInstanceOf(CallNotFoundError);
    communities.findById.mockResolvedValue(undefined);
    await expect(
      authorizer.assertAccess(call, identity),
    ).rejects.toBeInstanceOf(CallNotFoundError);
  });
});
