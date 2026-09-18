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

describe('CallStarter', () => {
  const caller = new IdentityId(
    'MCowBQYDK2VwAyEAIZERRRhGaokvb3xQqMGr9Y2ble6jUd51OuZRsvW52Q4=',
  );
  const recipient = new IdentityId(
    'MCowBQYDK2VwAyEARcVr0970Zu0KPAIPEEvpy9RjsnM05VnDmccfWloMx8k=',
  );
  const networkId = new NetworkId('550e8400-e29b-41d4-a716-446655440000');

  it('starts a conversation call using participants from the conversation aggregate', async () => {
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
    const repository: MockProxy<CallRepository> = mock<CallRepository>();
    repository.findByCommunityChannel.mockResolvedValue([]);
    const conversationRepository: MockProxy<ConversationRepository> =
      mock<ConversationRepository>();
    const communityRepository: MockProxy<CommunityRepository> =
      mock<CommunityRepository>();
    const eventPublisher: MockProxy<DomainEventPublisher> =
      mock<DomainEventPublisher>();
    const leaseRenewer = mock<CallParticipantLeaseRenewer>();
    const lease = mock<CallParticipantLease>();
    let savedCall: Awaited<Parameters<CallRepository['save']>[0]> | undefined;

    repository.findActiveByCommunityChannel.mockResolvedValue(undefined);
    repository.save.mockImplementation((call) => {
      savedCall = call;

      return Promise.resolve();
    });
    conversationRepository.findMetadataById.mockResolvedValue(conversation);
    lease.pullDomainEvents.mockReturnValue([]);
    leaseRenewer.renew.mockResolvedValue(lease);

    const starter = new CallStarter(
      repository,
      new CallScopeResolver(conversationRepository, communityRepository),
      eventPublisher,
      leaseRenewer,
      new CommunityChannelCallStartCoordinator(),
    );

    const call = await starter.start(
      new CallStartMessage(
        caller.valueOf(),
        'conversation',
        conversationId.valueOf(),
      ),
    );

    expect(repository.save).toHaveBeenCalledWith(call);
    expect(savedCall).toBe(call);
    expect(call.hasParticipant(caller)).toBe(true);
    expect(call.hasParticipant(recipient)).toBe(true);
    expect(eventPublisher.publish).toHaveBeenCalledWith(expect.any(Array));
  });

  it('starts a community channel call with only the requester joined initially', async () => {
    const repository: MockProxy<CallRepository> = mock<CallRepository>();
    repository.findByCommunityChannel.mockResolvedValue([]);
    const conversationRepository: MockProxy<ConversationRepository> =
      mock<ConversationRepository>();
    const communityRepository: MockProxy<CommunityRepository> =
      mock<CommunityRepository>();
    const eventPublisher: MockProxy<DomainEventPublisher> =
      mock<DomainEventPublisher>();
    const leaseRenewer = mock<CallParticipantLeaseRenewer>();
    const lease = mock<CallParticipantLease>();
    const authorizeVoiceChannelCall = jest.fn();
    let savedCall: Awaited<Parameters<CallRepository['save']>[0]> | undefined;

    repository.findActiveByCommunityChannel.mockResolvedValue(undefined);
    repository.save.mockImplementation((call) => {
      savedCall = call;

      return Promise.resolve();
    });
    communityRepository.findById.mockResolvedValue({
      authorizeVoiceChannelCall,
      getNetworkId: () => networkId,
    } as never);
    lease.pullDomainEvents.mockReturnValue([]);
    leaseRenewer.renew.mockResolvedValue(lease);

    const starter = new CallStarter(
      repository,
      new CallScopeResolver(conversationRepository, communityRepository),
      eventPublisher,
      leaseRenewer,
      new CommunityChannelCallStartCoordinator(),
    );

    const call = await starter.start(
      new CallStartMessage(
        caller.valueOf(),
        'community_channel',
        undefined,
        'community-1',
        'voice-1',
      ),
    );

    expect(repository.save).toHaveBeenCalledWith(call);
    expect(savedCall).toBe(call);
    expect(authorizeVoiceChannelCall).toHaveBeenCalledTimes(1);
    expect(call.hasParticipant(caller)).toBe(true);
    expect(call.hasParticipant(recipient)).toBe(false);
    expect(call.toPrimitives().participantIds).toEqual([caller.valueOf()]);
    expect(eventPublisher.publish).toHaveBeenCalledWith(expect.any(Array));
  });

  it('reuses one community channel call when participants join concurrently', async () => {
    const otherCaller = new IdentityId(
      'MCowBQYDK2VwAyEAwg5LY0eW1pL8E8D2slZJKjQYS6btRH5DMSdrN0lpLkg=',
    );
    const repository: MockProxy<CallRepository> = mock<CallRepository>();
    repository.findByCommunityChannel.mockResolvedValue([]);
    const conversationRepository: MockProxy<ConversationRepository> =
      mock<ConversationRepository>();
    const communityRepository: MockProxy<CommunityRepository> =
      mock<CommunityRepository>();
    const eventPublisher: MockProxy<DomainEventPublisher> =
      mock<DomainEventPublisher>();
    const leaseRenewer = mock<CallParticipantLeaseRenewer>();
    const lease = mock<CallParticipantLease>();
    let activeCall: Awaited<
      ReturnType<CallRepository['findActiveByCommunityChannel']>
    >;

    repository.findByCommunityChannel.mockImplementation(() =>
      Promise.resolve(activeCall ? [activeCall] : []),
    );
    repository.save.mockImplementation((call) => {
      activeCall = call;

      return Promise.resolve();
    });
    communityRepository.findById.mockResolvedValue({
      authorizeVoiceChannelCall: jest.fn(),
      getNetworkId: () => networkId,
    } as never);
    lease.pullDomainEvents.mockReturnValue([]);
    leaseRenewer.renew.mockResolvedValue(lease);

    const starter = new CallStarter(
      repository,
      new CallScopeResolver(conversationRepository, communityRepository),
      eventPublisher,
      leaseRenewer,
      new CommunityChannelCallStartCoordinator(),
    );
    const startCall = (identityId: IdentityId) =>
      starter.start(
        new CallStartMessage(
          identityId.valueOf(),
          'community_channel',
          undefined,
          'community-1',
          'voice-1',
        ),
      );

    const [firstCall, secondCall] = await Promise.all([
      startCall(caller),
      startCall(otherCaller),
    ]);

    expect(secondCall.getId().isEqual(firstCall.getId())).toBe(true);
    expect(firstCall.hasParticipant(caller)).toBe(true);
    expect(firstCall.hasParticipant(otherCaller)).toBe(true);
  });

  function isolatedStarter(
    history: Call[] = [],
    scopedNetworkId = networkId,
    active?: Call,
    repository = mock<CallRepository>(),
  ) {
    repository.findActiveByCommunityChannel.mockResolvedValue(active);
    repository.findByCommunityChannel.mockResolvedValue(history);
    const communityRepository = mock<CommunityRepository>();
    communityRepository.findById.mockResolvedValue({
      authorizeVoiceChannelCall: jest.fn(),
      getNetworkId: () => scopedNetworkId,
    } as never);
    const leaseRenewer = mock<CallParticipantLeaseRenewer>();
    const lease = mock<CallParticipantLease>();
    lease.pullDomainEvents.mockReturnValue([]);
    leaseRenewer.renew.mockResolvedValue(lease);

    return new CallStarter(
      repository,
      new CallScopeResolver(
        mock<ConversationRepository>(),
        communityRepository,
      ),
      mock<DomainEventPublisher>(),
      leaseRenewer,
      new CommunityChannelCallStartCoordinator(),
    );
  }

  function communityStart(
    identityId = caller,
    channelId = 'voice-1',
    communityId = 'community-1',
  ) {
    return new CallStartMessage(
      identityId.valueOf(),
      'community_channel',
      undefined,
      communityId,
      channelId,
    );
  }

  function endedCommunity(sessionEpoch?: number, createdAt = 100): Call {
    const call = Call.start(
      caller,
      networkId,
      CallScope.communityChannel(
        new CommunityId('community-1'),
        new CommunityChannelId('voice-1'),
      ),
      [],
    );
    call.end(caller);
    const primitives = {
      ...call.toPrimitives(),
      createdAt,
      endedAt: createdAt + 1,
      ...(sessionEpoch === undefined ? {} : { sessionEpoch }),
    };

    return Call.fromPrimitives(primitives);
  }

  it('assigns the same first community session to independent nodes and callers', async () => {
    const firstNode = isolatedStarter();
    const secondNode = isolatedStarter();
    const [firstCall, secondCall] = await Promise.all([
      firstNode.start(communityStart(caller)),
      secondNode.start(communityStart(recipient)),
    ]);
    expect(firstCall.getId().isEqual(secondCall.getId())).toBe(true);
    expect(firstCall.toPrimitives()).toHaveProperty('sessionEpoch', 1);
    expect(secondCall.toPrimitives()).toHaveProperty('sessionEpoch', 1);
    expect(firstCall.hasJoinedParticipant(caller)).toBe(true);
    expect(secondCall.hasJoinedParticipant(recipient)).toBe(true);
  });

  it('separates deterministic sessions by network, community and channel', async () => {
    const otherNetwork = new NetworkId('550e8400-e29b-41d4-a716-446655440001');
    const calls = await Promise.all([
      isolatedStarter().start(communityStart()),
      isolatedStarter().start(communityStart(caller, 'voice-2')),
      isolatedStarter().start(communityStart(caller, 'voice-1', 'community-2')),
      isolatedStarter([], otherNetwork).start(communityStart()),
    ]);
    expect(new Set(calls.map((call) => call.getId().valueOf())).size).toBe(4);
    for (const call of calls)
      expect(call.toPrimitives()).toHaveProperty('sessionEpoch', 1);
  });

  it('advances the greatest known session epoch independently of history order and clock', async () => {
    const olderEpochWithNewerClock = endedCommunity(2, 90000);
    const latestEpochWithOlderClock = endedCommunity(7, 100);
    jest.useFakeTimers();
    try {
      jest.setSystemTime(1000000);
      const first = await isolatedStarter([
        olderEpochWithNewerClock,
        latestEpochWithOlderClock,
      ]).start(communityStart());
      jest.setSystemTime(1000);
      const second = await isolatedStarter([
        latestEpochWithOlderClock,
        olderEpochWithNewerClock,
      ]).start(communityStart(recipient));
      expect(first.toPrimitives()).toHaveProperty('sessionEpoch', 8);
      expect(second.toPrimitives()).toHaveProperty('sessionEpoch', 8);
      expect(first.getId().isEqual(second.getId())).toBe(true);
      expect(first.getId().isEqual(latestEpochWithOlderClock.getId())).toBe(
        false,
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('starts epoch one after an explicitly ended legacy call without an epoch', async () => {
    const legacy = endedCommunity();
    const [first, second] = await Promise.all([
      isolatedStarter([legacy]).start(communityStart()),
      isolatedStarter([legacy]).start(communityStart(recipient)),
    ]);
    expect(first.toPrimitives()).toHaveProperty('sessionEpoch', 1);
    expect(first.getId().isEqual(second.getId())).toBe(true);
    expect(first.getId().isEqual(legacy.getId())).toBe(false);
  });

  it('preserves an existing active legacy call identifier instead of replacing its session', async () => {
    const active = Call.start(
      caller,
      networkId,
      CallScope.communityChannel(
        new CommunityId('community-1'),
        new CommunityChannelId('voice-1'),
      ),
      [],
    );
    const call = await isolatedStarter([active], networkId, active).start(
      communityStart(recipient),
    );
    expect(call.getId().isEqual(active.getId())).toBe(true);
    expect(call.hasJoinedParticipant(caller)).toBe(true);
    expect(call.hasJoinedParticipant(recipient)).toBe(true);
  });

  it('reuses the active call in one history snapshot without a stale separate active lookup', async () => {
    const existing = await isolatedStarter().start(communityStart());
    const repository = mock<CallRepository>();
    const starter = isolatedStarter(
      [existing],
      networkId,
      undefined,
      repository,
    );
    const call = await starter.start(communityStart(recipient));
    expect(call.getId().isEqual(existing.getId())).toBe(true);
    expect(call.toPrimitives()).toHaveProperty('sessionEpoch', 1);
    expect(call.hasJoinedParticipant(recipient)).toBe(true);
    expect(repository.findByCommunityChannel).toHaveBeenCalledTimes(1);
    expect(repository.findActiveByCommunityChannel).not.toHaveBeenCalled();
  });
});
