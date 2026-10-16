import SendPushNotificationWhenCallStarted from '@app/apps/consumers/pubsub/push/SendPushNotificationWhenCallStarted';
import CallEventAttestor from '@app/contexts/calls/application/attest-event/CallEventAttestor';
import { IdentityNotFoundError } from '@app/contexts/identities/domain/errors/IdentityNotFoundError';
import PushNotificationDispatcher from '@app/contexts/push-notifications/application/send/PushNotificationDispatcher';
import { DomainEventConsumer } from '@app/shared/infrastructure/messageBus/DomainEventConsumer';
import Kernel from '@haskou/ddd-kernel';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { mock } from 'jest-mock-extended';
import { setImmediate } from 'node:timers/promises';

class TestCallStartedEvent extends DomainEvent {
  public eventName(): string {
    return 'calls.v1.call.was_started';
  }
}

describe('SendPushNotificationWhenCallStarted', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should log only the error class when the call start cannot be attested', async () => {
    const callId = 'c'.repeat(64);
    const identityId = 'f'.repeat(64);
    const warn = jest.fn();
    const attestor = mock<CallEventAttestor>();
    const dispatcher = mock<PushNotificationDispatcher>();
    const consumer = new SendPushNotificationWhenCallStarted(
      mock<DomainEventConsumer>(),
      dispatcher,
      attestor,
    );

    jest
      .spyOn(Kernel, 'logger', 'get')
      .mockReturnValue({ warn } as unknown as typeof Kernel.logger);
    attestor.attest.mockRejectedValue(new IdentityNotFoundError(identityId));

    await consumer.handler(new TestCallStartedEvent(callId, {}));
    await setImmediate();

    expect(dispatcher.dispatch).not.toHaveBeenCalled();
    expect(warn.mock.calls).toEqual([
      ['Call start push failed: error=IdentityNotFoundError'],
    ]);
  });
});
