import CallTimeoutScheduler from '@app/apps/schedulers/CallTimeoutScheduler';
import { Call } from '@app/contexts/calls/domain/Call';
import { CallScope } from '@app/contexts/calls/domain/CallScope';
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
});
