import CallTimeoutScheduler from '@app/apps/schedulers/CallTimeoutScheduler';
import { Call } from '@app/contexts/calls/domain/Call';
import { CallScope } from '@app/contexts/calls/domain/CallScope';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

describe('CallTimeoutScheduler', () => {
  const creator = new IdentityId(
    'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
  );
  const recipient = new IdentityId(
    'MCowBQYDK2VwAyEAKV3uU7LZg0grhngWKkoR9jqZo5M3yQ2GHliIFMgdJZw=',
  );

  it('should mark timed out ringing calls as missed and create notifications', async () => {
    const call = Call.start(
      creator,
      new NetworkId('550e8400-e29b-41d4-a716-446655440000'),
      CallScope.conversation(new ConversationId('one-to-one:call-timeout')),
      [recipient],
    );
    const callRepository = {
      findTimedOutJoinedCalls: jest.fn().mockResolvedValue([]),
      findTimedOutRingingCalls: jest.fn().mockResolvedValue([call]),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const eventPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    };
    const notificationRepository = {
      save: jest.fn().mockResolvedValue(undefined),
    };
    const scheduler = new CallTimeoutScheduler({
      callRepository,
      eventPublisher,
      notificationRepository,
    });

    call.pullDomainEvents();
    await scheduler.execute();

    expect(callRepository.save).toHaveBeenCalledWith(call);
    expect(notificationRepository.save).toHaveBeenCalledTimes(1);
    expect(eventPublisher.publish).toHaveBeenCalledTimes(2);
    expect(call.toPrimitives().status).toBe('missed');
  });

  it('should not mark community channel calls as missed', async () => {
    const call = Call.start(
      creator,
      new NetworkId('550e8400-e29b-41d4-a716-446655440000'),
      CallScope.communityChannel(
        new CommunityId('6a038fd206de460039b0d923'),
        new CommunityChannelId('6a038fd206de460039b0d924'),
      ),
      [recipient],
    );
    const callRepository = {
      findTimedOutJoinedCalls: jest.fn().mockResolvedValue([]),
      findTimedOutRingingCalls: jest.fn().mockResolvedValue([call]),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const eventPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    };
    const notificationRepository = {
      save: jest.fn().mockResolvedValue(undefined),
    };
    const scheduler = new CallTimeoutScheduler({
      callRepository,
      eventPublisher,
      notificationRepository,
    });

    call.pullDomainEvents();
    await scheduler.execute();

    expect(callRepository.save).not.toHaveBeenCalled();
    expect(notificationRepository.save).not.toHaveBeenCalled();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
    expect(call.toPrimitives().status).toBe('active');
  });

  it('should mark joined participants as left when heartbeat times out', async () => {
    const call = Call.fromPrimitives({
      createdAt: Date.now() - 10_000,
      endedAt: undefined,
      endedByIdentityId: undefined,
      creatorIdentityId: creator.valueOf(),
      id: '550e8400-e29b-41d4-a716-446655440020',
      networkId: '550e8400-e29b-41d4-a716-446655440000',
      participantIds: [creator.valueOf(), recipient.valueOf()],
      participants: [
        {
          identityId: creator.valueOf(),
          joinedAt: Date.now() - 10_000,
          lastSeenAt: Date.now() - 10_000,
          status: 'joined',
        },
        {
          identityId: recipient.valueOf(),
          status: 'ringing',
        },
      ],
      scope: {
        channelId: undefined,
        communityId: undefined,
        conversationId: 'one-to-one:call-timeout',
        type: 'conversation',
      },
      status: 'active',
    });
    const callRepository = {
      findTimedOutJoinedCalls: jest.fn().mockResolvedValue([call]),
      findTimedOutRingingCalls: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const eventPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    };
    const notificationRepository = {
      save: jest.fn().mockResolvedValue(undefined),
    };
    const scheduler = new CallTimeoutScheduler({
      callRepository,
      eventPublisher,
      notificationRepository,
    });

    call.pullDomainEvents();
    await scheduler.execute();

    expect(callRepository.save).toHaveBeenCalledWith(call);
    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    expect(call.toPrimitives().participants[0]).toMatchObject({
      identityId: creator.valueOf(),
      status: 'left',
    });
  });
});
