import Kernel from '@haskou/ddd-kernel';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import MemoryMessageBusAdapter from '@app/shared/infrastructure/messageBus/memory/MemoryMessageBusAdapter';

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
    (
      Kernel as unknown as {
        _consumers: unknown[];
      }
    )._consumers = [
      {
        eventName: TestDomainEvent.EVENT_NAME,
        exchange: 'pigeon-swarm',
        queueName: 'test.queue',
      },
    ];
  });

  afterEach(() => {
    process.env.SERVICE_NAME = originalServiceName;
    (
      Kernel as unknown as {
        _consumers: unknown[];
      }
    )._consumers = [];
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
});
