import { IdentityNotFoundError } from '@app/contexts/identities/domain/errors/IdentityNotFoundError';
import MemoryMessageBusAdapter from '@app/shared/infrastructure/messageBus/memory/MemoryMessageBusAdapter';
import Kernel from '@haskou/ddd-kernel';
import { DomainEvent } from '@haskou/ddd-kernel/domain';

class TestDomainEvent extends DomainEvent {
  public static EVENT_NAME = 'test.event';

  public eventName(): string {
    return TestDomainEvent.EVENT_NAME;
  }
}

describe('MemoryMessageBusAdapter', () => {
  const originalServiceName = process.env.SERVICE_NAME;

  beforeEach(() => {
    process.env.SERVICE_NAME = 'pigeon-swarm';
    MemoryMessageBusAdapter.memoryMessages = {};
    MemoryMessageBusAdapter.errorMemoryMessages = {};
    new Kernel().registerConsumerInstances({
      eventName: TestDomainEvent.EVENT_NAME,
      exchange: 'pigeon-swarm',
      queueName: 'test.queue',
    } as never);
  });

  afterEach(() => {
    process.env.SERVICE_NAME = originalServiceName;
    new Kernel().removeConsumers();
  });

  it('should publish to consumers on the default service exchange', async () => {
    const adapter = new MemoryMessageBusAdapter();

    await adapter.publish([new TestDomainEvent('aggregate-id')]);

    expect(MemoryMessageBusAdapter.memoryMessages['test.queue']).toHaveLength(
      1,
    );
    expect(
      MemoryMessageBusAdapter.memoryMessages['test.queue'][0].exchange,
    ).toBe('pigeon-swarm');
  });

  it('should log only the event, consumer and error class when a consumer rejects', async () => {
    const identityId = 'f'.repeat(64);
    const error = jest.fn();
    const adapter = new MemoryMessageBusAdapter();

    jest.useFakeTimers();
    jest
      .spyOn(Kernel, 'logger', 'get')
      .mockReturnValue({ error } as unknown as typeof Kernel.logger);
    await adapter.consume(
      'test.queue',
      TestDomainEvent.EVENT_NAME,
      TestDomainEvent,
      'pigeon-swarm',
      jest.fn().mockRejectedValue(new IdentityNotFoundError(identityId)),
    );
    await adapter.publish([new TestDomainEvent(identityId)]);

    await jest.advanceTimersByTimeAsync(50);
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();

    expect(error.mock.calls).toEqual([
      [
        'Dropped in-memory event: event=test.event consumer=test.queue error=IdentityNotFoundError',
      ],
    ]);
  });
});
