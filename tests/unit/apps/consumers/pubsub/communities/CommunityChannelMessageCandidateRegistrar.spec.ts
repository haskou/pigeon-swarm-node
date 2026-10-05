import { CommunityChannelMessageCandidate } from '@app/apps/consumers/pubsub/communities/CommunityChannelMessageCandidate';
import CommunityChannelMessageCandidateRegistrar from '@app/apps/consumers/pubsub/communities/CommunityChannelMessageCandidateRegistrar';
import { Community } from '@app/contexts/communities/domain/Community';
import CommunityChannelMessageRepository from '@app/contexts/communities/domain/repositories/CommunityChannelMessageRepository';
import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { mock, MockProxy } from 'jest-mock-extended';

import { signedMutation } from '../../../../contexts/public-mutations/support/signedMutation';
import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('CommunityChannelMessageCandidateRegistrar', () => {
  const channelId = 'community-channel-1';
  const communityId = 'community-1';
  const createdAt = 1778513696020;
  const messageId = 'community-message-1';
  const networkId = '550e8400-e29b-41d4-a716-446655440001';

  let identityMother: IdentityMother;
  let messageRepository: MockProxy<CommunityChannelMessageRepository>;
  let registrar: CommunityChannelMessageCandidateRegistrar;

  beforeEach(() => {
    identityMother = new IdentityMother();
    messageRepository = mock<CommunityChannelMessageRepository>();
    registrar = new CommunityChannelMessageCandidateRegistrar(
      messageRepository,
    );
  });

  function community(): Community {
    return Community.fromPrimitives({
      autoJoinEnabled: false,
      avatar: undefined,
      bannedMemberIds: [],
      banner: undefined,
      createdAt,
      description: 'Community description',
      discoverable: true,
      id: communityId,
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
      textChannels: [
        {
          createdAt,
          id: channelId,
          name: 'general',
          permissions: { visibleRoleIds: ['everyone'] },
          type: 'text',
        },
      ],
      visibility: 'private',
      voiceChannels: [],
    });
  }

  function candidate(): CommunityChannelMessageCandidate {
    return {
      authorIdentityId: identityMother.id.valueOf(),
      channelId,
      communityId,
      createdAt,
      editedAt: undefined,
      encryptedPayload: 'encrypted-payload',
      id: messageId,
      mentions: [],
      plaintextPayload: undefined,
      pollId: undefined,
      replyToMessageId: undefined,
      type: 'sent',
    };
  }

  async function proof() {
    return (
      await signedMutation({
        identityId: identityMother.id.valueOf(),
        kind: 'put',
        recordId: `community:${communityId}:${channelId}:${messageId}:${identityMother.id.valueOf()}`,
        sequence: 1,
        store: 'messages',
      })
    ).toPrimitives();
  }

  it('persists community channel message candidates with their proof', async () => {
    const mutationProof = await proof();

    await registrar.registerSent(community(), candidate(), mutationProof);

    expect(messageRepository.save).toHaveBeenCalledTimes(1);
    expect(
      messageRepository.save.mock.calls[0][0].toPrimitives(),
    ).toMatchObject({
      authorIdentityId: identityMother.id.valueOf(),
      encryptedPayload: 'encrypted-payload',
      id: messageId,
    });
    expect(messageRepository.save.mock.calls[0][1].toPrimitives()).toEqual(
      mutationProof,
    );
  });

  it('drops candidates that the public mutation gate rejects', async () => {
    messageRepository.save.mockRejectedValue(new InvalidPublicMutationError());

    await expect(
      registrar.registerSent(community(), candidate(), await proof()),
    ).resolves.toBeUndefined();
  });
});
