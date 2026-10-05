import { CommunityChannelMessageCandidate } from '@app/apps/consumers/pubsub/communities/CommunityChannelMessageCandidate';
import CommunityChannelMessageCandidateRegistrar from '@app/apps/consumers/pubsub/communities/CommunityChannelMessageCandidateRegistrar';
import RegisterCommunityMessageEdition from '@app/apps/consumers/pubsub/communities/RegisterCommunityChannelMessageEditionWhenAnnounced';
import RegisterCommunityMessageWhenAnnounced from '@app/apps/consumers/pubsub/communities/RegisterCommunityChannelMessageWhenAnnounced';
import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityRole } from '@app/contexts/communities/domain/entities/membership/CommunityRole';
import { CommunityChannelMessage } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessage';
import { CommunityChannelMessageWasSentEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageWasSentEvent';
import CommunityChannelMessageRepository from '@app/contexts/communities/domain/repositories/CommunityChannelMessageRepository';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import { PrimitiveOf } from '@haskou/value-objects';
import { mock } from 'jest-mock-extended';
import { generateKeyPairSync } from 'node:crypto';

import { signedMutation } from '../../../../contexts/public-mutations/support/signedMutation';
import { IdentityMother } from '../../../../mothers/IdentityMother';

describe.each([
  ['sent', RegisterCommunityMessageWhenAnnounced, 'registerSent'],
  ['edited', RegisterCommunityMessageEdition, 'registerEdition'],
] as const)('%s community message consumption', (kind, Consumer, method) => {
  function fixture() {
    const owner = new IdentityMother().id;
    const community = Community.fromPrimitives({
      autoJoinEnabled: false,
      avatar: undefined,
      bannedMemberIds: [],
      banner: undefined,
      createdAt: 1778513696020,
      description: 'Folded description',
      discoverable: false,
      id: 'community-replica',
      memberIds: [owner.valueOf()],
      memberRoles: [],
      name: 'Folded profile',
      networkId: '550e8400-e29b-41d4-a716-446655440001',
      ownerIdentityId: owner.valueOf(),
      roles: [CommunityRole.everyone().toPrimitives()],
      textChannels: [],
      visibility: 'private',
      voiceChannels: [],
    });
    const snapshot = structuredClone(community.toPrimitives());
    const message = {
      authorIdentityId: owner.valueOf(),
      channelId: 'channel-replica',
      communityId: snapshot.id,
      createdAt: snapshot.createdAt,
      encryptedPayload: 'encrypted-content',
      id: 'message-replica',
      type: 'sent',
    };
    const mutationProof = { proof: 'placeholder' };
    const event = new CommunityChannelMessageWasSentEvent(snapshot.id, {
      community: snapshot,
      message,
      mutationProof,
    });
    const repository = mock<CommunityRepository>();
    const registrar = mock<CommunityChannelMessageCandidateRegistrar>();
    registrar[method].mockResolvedValue(mock<CommunityChannelMessage>());
    const consumer = new Consumer(
      mock<DomainEventConsumer>(),
      repository,
      registrar,
    );

    return {
      community,
      consumer,
      event,
      message,
      mutationProof,
      registrar,
      repository,
    };
  }

  it('validates against the community folded from signed operations, never the event snapshot', async () => {
    const {
      community,
      consumer,
      event,
      message,
      mutationProof,
      registrar,
      repository,
    } = fixture();
    repository.findById.mockResolvedValue(community);

    await consumer.handler(event);

    expect(repository.findById).toHaveBeenCalledWith(community.getId());
    expect(registrar[method]).toHaveBeenCalledWith(
      community,
      message,
      mutationProof,
    );
    expect(registrar[method].mock.calls[0][0]).toBe(community);
  });

  it('never writes the community document it validated against', async () => {
    const { community, consumer, event, repository } = fixture();
    repository.findById.mockResolvedValue(community);

    await consumer.handler(event);

    expect(repository.save).not.toHaveBeenCalled();
  });

  it('ignores a message whose community has no signed operations locally', async () => {
    const { consumer, event, registrar, repository } = fixture();
    repository.findById.mockResolvedValue(undefined);

    await consumer.handler(event);

    expect(registrar[method]).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects a delayed event whose author is no longer a member of the folded community', async () => {
    const { community: initial, repository } = fixture();
    const owner = new IdentityId(
      generateKeyPairSync('ed25519')
        .publicKey.export({ format: 'der', type: 'spki' })
        .toString('base64'),
    );
    const author = new IdentityMother();
    const channelId = 'channel-delayed';
    const snapshot: PrimitiveOf<Community> = {
      ...initial.toPrimitives(),
      memberIds: [owner.valueOf(), author.id.valueOf()],
      ownerIdentityId: owner.valueOf(),
      textChannels: [
        {
          createdAt: 1778513696020,
          id: channelId,
          name: 'general',
          permissions: { visibleRoleIds: ['everyone'] },
          type: 'text',
        },
      ],
    };
    const folded = Community.fromPrimitives(snapshot);
    folded.kickMember(owner, author.id);
    repository.findById.mockResolvedValue(folded);
    const messages = mock<CommunityChannelMessageRepository>();
    const candidate: CommunityChannelMessageCandidate = {
      authorIdentityId: author.id.valueOf(),
      channelId,
      communityId: snapshot.id,
      createdAt: 1778513696020,
      editedAt: kind === 'edited' ? 1778513697020 : undefined,
      encryptedPayload: 'encrypted-payload',
      id: 'delayed-message',
      mentions: [],
      plaintextPayload: undefined,
      pollId: undefined,
      replyToMessageId: undefined,
      type: 'sent' as const,
    };
    messages.findById.mockResolvedValue(
      CommunityChannelMessage.fromPrimitives({
        ...candidate,
        editedAt: undefined,
      }),
    );
    const mutationProof = (
      await signedMutation({
        identityId: author.id.valueOf(),
        kind: 'put',
        recordId: `community:${snapshot.id}:${channelId}:${candidate.id}:${author.id.valueOf()}`,
        sequence: 1,
        store: 'messages',
      })
    ).toPrimitives();
    const consumer = new Consumer(
      mock<DomainEventConsumer>(),
      repository,
      new CommunityChannelMessageCandidateRegistrar(messages),
    );
    const event = new CommunityChannelMessageWasSentEvent(snapshot.id, {
      community: snapshot,
      message: candidate,
      mutationProof,
    });

    await expect(consumer.handler(event)).rejects.toThrow();

    expect(messages.save).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
    expect(folded.isMember(author.id)).toBe(false);
  });

  it('does not fall back to the snapshot when the local lookup fails', async () => {
    const { consumer, event, registrar, repository } = fixture();
    repository.findById.mockRejectedValue(new Error('Storage unavailable'));

    await expect(consumer.handler(event)).rejects.toThrow(
      'Storage unavailable',
    );

    expect(registrar[method]).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });
});
