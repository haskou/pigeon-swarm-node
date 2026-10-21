import CallAccessAuthorizer from '@app/contexts/calls/application/authorize-call/CallAccessAuthorizer';
import { Call } from '@app/contexts/calls/domain/Call';
import { CallScope } from '@app/contexts/calls/domain/CallScope';
import { CallNotFoundError } from '@app/contexts/calls/domain/errors/CallNotFoundError';
import { CallCapabilityHash } from '@app/contexts/calls/domain/value-objects/CallCapabilityHash';
import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityMemberNotFoundError } from '@app/contexts/communities/domain/errors/CommunityMemberNotFoundError';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';
import { BearerCapability } from '@haskou/pigeon-swarm-crypto';
import { mock } from 'jest-mock-extended';

import { callStartArgs } from '../../../../support/signCall';

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
      ...callStartArgs(),
    );
    const conversation = mock<Conversation>();
    conversations.hasById.mockResolvedValue(true);
    conversations.requireMetadataById.mockResolvedValue(conversation);
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
      ...callStartArgs(),
    );
    const community = mock<Community>();
    communities.hasById.mockResolvedValue(true);
    communities.requireById.mockResolvedValue(community);
    await expect(
      authorizer.assertAccess(call, identity),
    ).resolves.toBeUndefined();
    expect(community.authorizeVoiceChannelCall).toHaveBeenCalledWith(
      identity,
      new CommunityChannelId('voice-1'),
    );
    community.authorizeVoiceChannelCall.mockImplementation(() => {
      throw new CommunityMemberNotFoundError();
    });
    await expect(
      authorizer.assertAccess(call, identity),
    ).rejects.toBeInstanceOf(CallNotFoundError);
    communities.hasById.mockResolvedValue(false);
    await expect(
      authorizer.assertAccess(call, identity),
    ).rejects.toBeInstanceOf(CallNotFoundError);
  });

  describe('when a repository it reads cannot answer', () => {
    const peer = new IdentityId(
      'MCowBQYDK2VwAyEAKV3uU7LZg0grhngWKkoR9jqZo5M3yQ2GHliIFMgdJZw=',
    );
    const communityCall = () => {
      const call = Call.start(
        identity,
        network,
        CallScope.communityChannel(
          new CommunityId('community-1'),
          new CommunityChannelId('voice-1'),
        ),
        [identity],
        ...callStartArgs(),
      );

      call.restoreLeaseRosteredParticipants([identity, peer]);

      return call;
    };

    beforeEach(() => {
      jest.resetAllMocks();
    });

    it('rejects instead of reading a community it cannot read as no access', async () => {
      communities.hasById.mockRejectedValue(new ReplicatedStateNotReadyError());

      await expect(
        authorizer.canAccess(communityCall(), identity),
      ).rejects.toBeInstanceOf(ReplicatedStateNotReadyError);
    });

    it('rejects instead of dropping participants from the authorized audience', async () => {
      const community = mock<Community>();
      communities.hasById.mockResolvedValue(true);
      communities.requireById
        .mockResolvedValueOnce(community)
        .mockRejectedValueOnce(new ReplicatedStateNotReadyError());

      await expect(
        authorizer.authorizedParticipants(communityCall()),
      ).rejects.toBeInstanceOf(ReplicatedStateNotReadyError);
    });

    it('rejects a conversation it cannot read instead of hiding the call', async () => {
      const call = Call.start(
        identity,
        network,
        CallScope.conversation(new ConversationId('conversation-1')),
        [identity],
        ...callStartArgs(),
      );
      conversations.hasById.mockResolvedValue(true);
      conversations.requireMetadataById.mockRejectedValue(
        new ReplicatedStateNotReadyError(),
      );

      await expect(authorizer.canAccess(call, identity)).rejects.toBeInstanceOf(
        ReplicatedStateNotReadyError,
      );
    });

    it('rejects a voice check that fails outside the community rules', async () => {
      const community = mock<Community>();
      communities.hasById.mockResolvedValue(true);
      communities.requireById.mockResolvedValue(community);
      community.authorizeVoiceChannelCall.mockImplementation(() => {
        throw new Error('unreadable channel permissions');
      });

      await expect(
        authorizer.canAccess(communityCall(), identity),
      ).rejects.toThrow('unreadable channel permissions');
    });

    it('still denies a verified outsider without rejecting', async () => {
      const community = mock<Community>();
      communities.hasById.mockResolvedValue(true);
      communities.requireById.mockResolvedValue(community);
      community.authorizeVoiceChannelCall.mockImplementation(
        (identityId: IdentityId) => {
          if (identityId.isEqual(peer))
            throw new CommunityMemberNotFoundError();
        },
      );

      await expect(authorizer.canAccess(communityCall(), peer)).resolves.toBe(
        false,
      );
      await expect(
        authorizer.authorizedParticipants(communityCall()),
      ).resolves.toEqual([identity]);
      communities.hasById.mockResolvedValue(false);
      await expect(
        authorizer.canAccess(communityCall(), identity),
      ).resolves.toBe(false);
    });
  });

  describe('a group-capability call', () => {
    const capability = 'Zm9yLXRoZS1ncm91cC1jYWxsLW9ubHktMzItYnl0ZXM';
    const outsider = new IdentityId(
      'MCowBQYDK2VwAyEAKV3uU7LZg0grhngWKkoR9jqZo5M3yQ2GHliIFMgdJZw=',
    );
    const groupCall = () =>
      Call.start(
        identity,
        network,
        CallScope.groupCapability(
          new CallCapabilityHash(BearerCapability.hash(capability)),
        ),
        [],
        ...callStartArgs(),
      );

    beforeEach(() => jest.clearAllMocks());

    it('admits whoever presents the capability, without reading any roster', async () => {
      await expect(
        authorizer.assertAccess(groupCall(), outsider, capability),
      ).resolves.toBeUndefined();
      expect(conversations.hasById).not.toHaveBeenCalled();
      expect(communities.hasById).not.toHaveBeenCalled();
    });

    it('hides the call from a wrong capability, even for a joined participant', async () => {
      await expect(
        authorizer.assertAccess(groupCall(), identity, `${capability}x`),
      ).rejects.toBeInstanceOf(CallNotFoundError);
    });

    it('without a capability admits only a joined participant', async () => {
      const call = groupCall();

      await expect(
        authorizer.assertAccess(call, identity),
      ).resolves.toBeUndefined();
      await expect(
        authorizer.assertAccess(call, outsider),
      ).rejects.toBeInstanceOf(CallNotFoundError);
    });
  });
});
