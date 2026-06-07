import { CommunityChannelMessageCandidateRegistrar } from '@app/apps/consumers/pubsub/communities/CommunityChannelMessageCandidateRegistrar';
import { Community } from '@app/contexts/communities/domain/Community';
import { InvalidCommunityChannelMessageSignatureError } from '@app/contexts/communities/domain/errors/InvalidCommunityChannelMessageSignatureError';
import { CommunityChannelMessageSignatureDomainService } from '@app/contexts/communities/domain/services/CommunityChannelMessageSignatureDomainService';
import { CommunityChannelMessageSignaturePayload } from '@app/contexts/communities/domain/services/types/CommunityChannelMessageSignaturePayload';
import { CommunityChannelMessagePrimitives } from '@app/contexts/communities/domain/types/CommunityChannelMessagePrimitives';
import { MongoCommunityChannelMessageRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityChannelMessageRepository';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('CommunityChannelMessageCandidateRegistrar', () => {
  const channelId = 'community-channel-1';
  const communityId = 'community-1';
  const createdAt = 1778513696020;
  const messageId = 'community-message-1';
  const networkId = '550e8400-e29b-41d4-a716-446655440001';
  const signatureService = new CommunityChannelMessageSignatureDomainService();

  let identityMother: IdentityMother;
  let messageRepository: MockProxy<MongoCommunityChannelMessageRepository>;
  let registrar: CommunityChannelMessageCandidateRegistrar;

  beforeEach(() => {
    identityMother = new IdentityMother();
    messageRepository = mock<MongoCommunityChannelMessageRepository>();
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

  async function signedMessagePrimitives(): Promise<CommunityChannelMessagePrimitives> {
    const signaturePayload: CommunityChannelMessageSignaturePayload = {
      attachmentExternalIdentifiers: [],
      authorIdentityId: identityMother.id.valueOf(),
      channelId,
      communityId,
      createdAt,
      encryptedPayload: 'encrypted-payload',
      id: messageId,
      mentions: [],
      plaintextPayload: undefined,
      replyToMessageId: undefined,
      type: 'sent' as const,
    };
    const signature = await identityMother.encryptedKeyPair.sign(
      signatureService.serializePayload(signaturePayload),
      identityMother.password,
    );

    return {
      ...signaturePayload,
      editedAt: undefined,
      pollId: undefined,
      signature: signature.valueOf(),
    } as CommunityChannelMessagePrimitives;
  }

  it('persists signed community channel message candidates', async () => {
    const primitives = await signedMessagePrimitives();

    await registrar.registerSent(community(), primitives);

    expect(messageRepository.save).toHaveBeenCalledTimes(1);
    expect(
      messageRepository.save.mock.calls[0][0].toPrimitives(),
    ).toMatchObject({
      authorIdentityId: identityMother.id.valueOf(),
      encryptedPayload: 'encrypted-payload',
      id: messageId,
      signature: primitives.signature,
    });
  });

  it('rejects forged community channel message candidates', async () => {
    const primitives = await signedMessagePrimitives();

    await expect(
      registrar.registerSent(community(), {
        ...primitives,
        encryptedPayload: 'forged-payload',
      }),
    ).rejects.toThrow(InvalidCommunityChannelMessageSignatureError);
    expect(messageRepository.save).not.toHaveBeenCalled();
  });
});
