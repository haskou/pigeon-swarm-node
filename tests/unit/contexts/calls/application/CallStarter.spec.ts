import CallParticipantLeaseRenewer from '@app/contexts/calls/application/renew-participant-lease/CallParticipantLeaseRenewer';
import CallScopeResolver from '@app/contexts/calls/application/start-call/CallScopeResolver';
import CallStarter from '@app/contexts/calls/application/start-call/CallStarter';
import CommunityChannelCallStartCoordinator from '@app/contexts/calls/application/start-call/CommunityChannelCallStartCoordinator';
import { CallStartMessage } from '@app/contexts/calls/application/start-call/messages/CallStartMessage';
import { Call } from '@app/contexts/calls/domain/Call';
import { CallParticipantLease } from '@app/contexts/calls/domain/CallParticipantLease';
import { CallScope } from '@app/contexts/calls/domain/CallScope';
import CallRepository from '@app/contexts/calls/domain/repositories/CallRepository';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { ConversationType } from '@app/contexts/conversations/domain/value-objects/ConversationType';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { DomainEventPublisher } from '@haskou/ddd-kernel/domain';
import { mock, MockProxy } from 'jest-mock-extended';

import {
  callStartArgs,
  CallSigner,
  mutationOf,
  newCallSigner,
  signCallStart,
} from '../../../../support/signCall';

describe('CallStarter', () => {
  const networkId = new NetworkId('550e8400-e29b-41d4-a716-446655440000');
  const recipient = new IdentityId(
    'MCowBQYDK2VwAyEARcVr0970Zu0KPAIPEEvpy9RjsnM05VnDmccfWloMx8k=',
  );
  let signer: CallSigner;
  let caller: IdentityId;

  beforeAll(async () => {
    signer = await newCallSigner();
    caller = new IdentityId(signer.id);
  });

  const startMessage = (
    scope:
      | { conversationId: string; type: 'conversation' }
      | { channelId: string; communityId: string; type: 'community_channel' },
    sessionEpoch?: number,
  ) => {
    const nonce = `starter-nonce-${Math.random().toString(36).slice(2, 12)}`;
    const { proof } = signCallStart({
      networkId: networkId.valueOf(),
      nonce,
      participantIds: [],
      scope,
      sessionEpoch,
      signer,
      startedAt: 1_770_000_000_000,
    });

    return new CallStartMessage(
      signer.id,
      {
        channelId:
          scope.type === 'community_channel' ? scope.channelId : undefined,
        communityId:
          scope.type === 'community_channel' ? scope.communityId : undefined,
        conversationId:
          scope.type === 'conversation' ? scope.conversationId : undefined,
        type: scope.type,
      },
      mutationOf(proof),
      nonce,
      1_770_000_000_000,
      sessionEpoch,
    );
  };

  const build = (
    repository: MockProxy<CallRepository>,
    conversationRepository: MockProxy<ConversationRepository> = mock<ConversationRepository>(),
    communityRepository: MockProxy<CommunityRepository> = mock<CommunityRepository>(),
  ) => {
    const eventPublisher: MockProxy<DomainEventPublisher> =
      mock<DomainEventPublisher>();
    const leaseRenewer = mock<CallParticipantLeaseRenewer>();
    const lease = mock<CallParticipantLease>();
    lease.pullDomainEvents.mockReturnValue([]);
    leaseRenewer.renew.mockResolvedValue(lease);

    return {
      eventPublisher,
      leaseRenewer,
      starter: new CallStarter(
        repository,
        new CallScopeResolver(conversationRepository, communityRepository),
        eventPublisher,
        leaseRenewer,
        new CommunityChannelCallStartCoordinator(),
      ),
    };
  };

  const communityRepositoryFor = () => {
    const communityRepository = mock<CommunityRepository>();
    communityRepository.hasById.mockResolvedValue(true);
    communityRepository.requireById.mockResolvedValue({
      authorizeVoiceChannelCall: jest.fn(),
      getNetworkId: () => networkId,
    } as never);

    return communityRepository;
  };

  it('starts a conversation call with the proof and the conversation participants', async () => {
    const conversationId = ConversationId.deterministic(
      caller,
      recipient,
      networkId,
    );
    const conversation = new Conversation(
      conversationId,
      networkId,
      ConversationType.ONE_TO_ONE,
      [caller, recipient],
    );
    const repository = mock<CallRepository>();
    const conversationRepository = mock<ConversationRepository>();
    conversationRepository.hasById.mockResolvedValue(true);
    conversationRepository.requireMetadataById.mockResolvedValue(conversation);
    const { eventPublisher, leaseRenewer, starter } = build(
      repository,
      conversationRepository,
    );
    const message = startMessage({
      conversationId: conversationId.valueOf(),
      type: 'conversation',
    });

    const call = await starter.start(message);

    expect(repository.saveStart).toHaveBeenCalledWith(call, message.getProof());
    expect(call.hasParticipant(caller)).toBe(true);
    expect(call.hasParticipant(recipient)).toBe(true);
    expect(call.toPrimitives()).toMatchObject({
      nonce: message.nonce.valueOf(),
      createdAt: 1_770_000_000_000,
    });
    expect(leaseRenewer.renew).toHaveBeenCalledWith(call, caller);
    expect(eventPublisher.publish).toHaveBeenCalledWith(expect.any(Array));
  });

  it('starts a community channel call with only the requester joined', async () => {
    const repository = mock<CallRepository>();
    repository.hasActiveByCommunityChannel.mockResolvedValue(false);
    const { starter } = build(repository, undefined, communityRepositoryFor());
    const message = startMessage(
      {
        channelId: 'voice-1',
        communityId: 'community-1',
        type: 'community_channel',
      },
      1,
    );

    const onRecordAccepted = jest.fn().mockResolvedValue(undefined);

    const call = await starter.start(message, onRecordAccepted);

    expect(onRecordAccepted).toHaveBeenCalledTimes(1);
    expect(onRecordAccepted.mock.invocationCallOrder[0]).toBeLessThan(
      repository.saveStart.mock.invocationCallOrder[0],
    );
    expect(repository.saveStart).toHaveBeenCalledWith(call, message.getProof());
    expect(call.toPrimitives().participantIds).toEqual([caller.valueOf()]);
    expect(call.toPrimitives()).toHaveProperty('sessionEpoch', 1);
  });

  it('returns the live community call without storing another start', async () => {
    const active = Call.start(
      recipient,
      networkId,
      CallScope.communityChannel(
        new CommunityId('community-1'),
        new CommunityChannelId('voice-1'),
      ),
      [],
      ...callStartArgs(),
    );
    const repository = mock<CallRepository>();
    repository.hasActiveByCommunityChannel.mockResolvedValue(true);
    repository.requireActiveByCommunityChannel.mockResolvedValue(active);
    const { eventPublisher, starter } = build(
      repository,
      undefined,
      communityRepositoryFor(),
    );
    const onRecordAccepted = jest.fn().mockResolvedValue(undefined);

    const call = await starter.start(
      startMessage(
        {
          channelId: 'voice-1',
          communityId: 'community-1',
          type: 'community_channel',
        },
        1,
      ),
      onRecordAccepted,
    );

    expect(call.getId().isEqual(active.getId())).toBe(true);
    expect(repository.saveStart).not.toHaveBeenCalled();
    expect(onRecordAccepted).not.toHaveBeenCalled();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('is not blocked by a non-admitted call: only the repository decides what is live', async () => {
    // A forged gossiped start is never in the repository, so the lookup is
    // empty and the requester's own signed start is stored.
    const repository = mock<CallRepository>();
    repository.hasActiveByCommunityChannel.mockResolvedValue(false);
    const { starter } = build(repository, undefined, communityRepositoryFor());

    await starter.start(
      startMessage(
        {
          channelId: 'voice-1',
          communityId: 'community-1',
          type: 'community_channel',
        },
        1,
      ),
    );

    expect(repository.saveStart).toHaveBeenCalledTimes(1);
  });

  it('rejects a conversation the requester is not part of', async () => {
    const repository = mock<CallRepository>();
    const conversationRepository = mock<ConversationRepository>();
    conversationRepository.hasById.mockResolvedValue(false);
    const { starter } = build(repository, conversationRepository);
    const onRecordAccepted = jest.fn().mockResolvedValue(undefined);

    await expect(
      starter.start(
        startMessage({
          conversationId: 'one-to-one:none',
          type: 'conversation',
        }),
        onRecordAccepted,
      ),
    ).rejects.toThrow();
    expect(onRecordAccepted).not.toHaveBeenCalled();
    expect(repository.saveStart).not.toHaveBeenCalled();
  });

  it('stores no start when the accepted record is refused', async () => {
    const repository = mock<CallRepository>();
    repository.hasActiveByCommunityChannel.mockResolvedValue(false);
    const { eventPublisher, starter } = build(
      repository,
      undefined,
      communityRepositoryFor(),
    );
    const overBudget = new Error('over budget');

    await expect(
      starter.start(
        startMessage(
          {
            channelId: 'voice-1',
            communityId: 'community-1',
            type: 'community_channel',
          },
          1,
        ),
        jest.fn().mockRejectedValue(overBudget),
      ),
    ).rejects.toBe(overBudget);
    expect(repository.saveStart).not.toHaveBeenCalled();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });
});
