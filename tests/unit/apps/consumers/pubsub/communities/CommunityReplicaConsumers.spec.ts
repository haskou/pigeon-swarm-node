import { generateKeyPairSync } from 'node:crypto';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import RegisterCommunityMessageWhenAnnounced from '@app/apps/consumers/pubsub/communities/RegisterCommunityChannelMessageWhenAnnounced';
import RegisterCommunityMessageEdition from '@app/apps/consumers/pubsub/communities/RegisterCommunityChannelMessageEditionWhenAnnounced';
import CommunityChannelMessageCandidateRegistrar from '@app/apps/consumers/pubsub/communities/CommunityChannelMessageCandidateRegistrar';
import { CommunityChannelMessageCandidate } from '@app/apps/consumers/pubsub/communities/CommunityChannelMessageCandidate';
import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityRole } from '@app/contexts/communities/domain/entities/membership/CommunityRole';
import { CommunityChannelMessage } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessage';
import { CommunityChannelMessageSignaturePayload } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessageSignaturePayload';
import CommunityChannelMessageRepository from '@app/contexts/communities/domain/repositories/CommunityChannelMessageRepository';
import CommunityChannelMessageSignatureDomainService from '@app/contexts/communities/domain/services/CommunityChannelMessageSignatureDomainService';
import { CommunityChannelMessageWasSentEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageWasSentEvent';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityName } from '@app/contexts/communities/domain/value-objects/CommunityName';
import { CommunityDescription } from '@app/contexts/communities/domain/value-objects/CommunityDescription';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import { mock } from 'jest-mock-extended';
import { IdentityMother } from '../../../../mothers/IdentityMother';

describe.each([
  ['sent', RegisterCommunityMessageWhenAnnounced, 'registerSent'],
  ['edited', RegisterCommunityMessageEdition, 'registerEdition'],
] as const)('%s community snapshot consumption', (_kind, Consumer, method) => {
  function fixture() {
    const owner = new IdentityMother().id;
    const community = Community.fromPrimitives({
      id: 'community-replica',
      networkId: '550e8400-e29b-41d4-a716-446655440001',
      ownerIdentityId: owner.valueOf(),
      name: 'Old profile',
      description: 'Old description',
      memberIds: [owner.valueOf()],
      bannedMemberIds: [],
      memberRoles: [],
      roles: [CommunityRole.everyone().toPrimitives()],
      textChannels: [],
      voiceChannels: [],
      visibility: 'private',
      createdAt: 1778513696020,
      autoJoinEnabled: false,
      discoverable: false,
      avatar: undefined,
      banner: undefined,
    });
    const snapshot = structuredClone(community.toPrimitives());
    const message = {
      id: 'message-replica',
      communityId: snapshot.id,
      channelId: 'channel-replica',
      authorIdentityId: owner.valueOf(),
      createdAt: snapshot.createdAt,
      encryptedPayload: 'encrypted-content',
      signature: 'signature',
      type: 'sent',
    };
    const event = new CommunityChannelMessageWasSentEvent(snapshot.id, {
      community: snapshot,
      message,
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
      owner,
      community,
      snapshot,
      event,
      repository,
      registrar,
      consumer,
      message,
    };
  }

  it('retains the loaded replica while validating the event snapshot', async () => {
    const {
      owner,
      community,
      snapshot,
      event,
      repository,
      registrar,
      consumer,
      message,
    } = fixture();
    const added = new IdentityId(
      generateKeyPairSync('ed25519')
        .publicKey.export({ format: 'der', type: 'spki' })
        .toString('base64'),
    );
    community.addMember(owner, added);
    community.updateProfile(
      owner,
      new CommunityName('Current profile'),
      new CommunityDescription('Current description'),
    );
    const current = structuredClone(community.toPrimitives());
    repository.findById.mockResolvedValue(community);

    await consumer.handler(event);

    expect(repository.findById).toHaveBeenCalledWith(community.getId());
    const validated = registrar[method].mock.calls[0][0];
    expect(validated.toPrimitives()).toEqual(snapshot);
    expect(validated).not.toBe(community);
    expect(registrar[method]).toHaveBeenCalledWith(validated, message);
    expect(repository.save).toHaveBeenCalledWith(community);
    expect(repository.save.mock.calls[0][0].toPrimitives()).toEqual(current);
    expect(event.attributes.community).toEqual(snapshot);
    expect(community.isMember(added)).toBe(true);
  });

  it('bootstraps an absent community from the event snapshot', async () => {
    const { snapshot, event, repository, registrar, consumer, message } =
      fixture();
    repository.findById.mockResolvedValue(undefined);

    await consumer.handler(event);

    const hydrated = repository.save.mock.calls[0][0];
    expect(hydrated.toPrimitives()).toEqual(snapshot);
    expect(registrar[method]).toHaveBeenCalledWith(hydrated, message);
  });

  it('accepts a signed delayed event after its author leaves without restoring membership', async () => {
    const { community: initial, repository } = fixture();
    const owner = new IdentityId(
      generateKeyPairSync('ed25519')
        .publicKey.export({ format: 'der', type: 'spki' })
        .toString('base64'),
    );
    const author = new IdentityMother();
    const channelId = 'channel-delayed';
    const snapshot: ReturnType<Community['toPrimitives']> = {
      ...initial.toPrimitives(),
      ownerIdentityId: owner.valueOf(),
      memberIds: [owner.valueOf(), author.id.valueOf()],
      textChannels: [
        {
          id: channelId,
          name: 'general',
          createdAt: 1778513696020,
          type: 'text',
          permissions: { visibleRoleIds: ['everyone'] },
        },
      ],
    };
    const canonical = Community.fromPrimitives(snapshot);
    canonical.kickMember(owner, author.id);
    repository.findById.mockResolvedValue(canonical);
    const current = structuredClone(canonical.toPrimitives());
    const signatureService =
      new CommunityChannelMessageSignatureDomainService();
    const messages = mock<CommunityChannelMessageRepository>();
    const candidate: CommunityChannelMessageCandidate = {
      id: 'delayed-message',
      communityId: snapshot.id,
      channelId,
      authorIdentityId: author.id.valueOf(),
      createdAt: 1778513696020,
      editedAt: _kind === 'edited' ? 1778513697020 : undefined,
      encryptedPayload: 'encrypted-payload',
      plaintextPayload: undefined,
      mentions: [],
      pollId: undefined,
      replyToMessageId: undefined,
      signature: 'initial-signature',
      type: 'sent' as const,
    };
    messages.findById.mockResolvedValue(
      CommunityChannelMessage.fromPrimitives({
        ...candidate,
        editedAt: undefined,
        signature: undefined,
      }),
    );
    const payload = CommunityChannelMessageSignaturePayload.fromPrimitives({
      authorIdentityId: author.id.valueOf(),
      channelId,
      communityId: snapshot.id,
      id: candidate.id,
      createdAt: candidate.editedAt ?? candidate.createdAt,
      encryptedPayload: candidate.encryptedPayload,
      plaintextPayload: undefined,
      mentions: [],
      replyToMessageId: undefined,
      type: _kind,
    });
    candidate.signature = (
      await author.encryptedKeyPair.sign(
        signatureService.getCanonicalSigningContent(payload),
        author.password,
      )
    ).valueOf();
    const realRegistrar = new CommunityChannelMessageCandidateRegistrar(
      messages,
      signatureService,
    );
    const consumer = new Consumer(
      mock<DomainEventConsumer>(),
      repository,
      realRegistrar,
    );
    const event = new CommunityChannelMessageWasSentEvent(snapshot.id, {
      community: snapshot,
      message: candidate,
    });

    await expect(realRegistrar[method](canonical, candidate)).rejects.toThrow();
    expect(messages.save).not.toHaveBeenCalled();
    await consumer.handler(event);

    expect(messages.save).toHaveBeenCalledTimes(1);
    expect(messages.save.mock.calls[0][0].toPrimitives()).toMatchObject({
      id: candidate.id,
      authorIdentityId: author.id.valueOf(),
      encryptedPayload: candidate.encryptedPayload,
    });
    expect(repository.save).toHaveBeenCalledWith(canonical);
    expect(canonical.toPrimitives()).toEqual(current);
    expect(canonical.isMember(author.id)).toBe(false);
  });

  it('does not fall back to a snapshot when canonical lookup fails', async () => {
    const { event, repository, registrar, consumer } = fixture();
    repository.findById.mockRejectedValue(new Error('Storage unavailable'));

    await expect(consumer.handler(event)).rejects.toThrow(
      'Storage unavailable',
    );

    expect(registrar[method]).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });
});
