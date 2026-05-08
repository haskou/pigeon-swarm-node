import DomainEvent from '@app/shared/domain/events/DomainEvent';
import AmqpMessageBusAdapter from '@app/shared/infrastructure/messageBus/amqp/AmqpMessageBusAdapter';
import HeliaPubSubMessageBusAdapter from '@app/shared/infrastructure/messageBus/helia/HeliaPubSubMessageBusAdapter';
import MemoryMessageBusAdapter from '@app/shared/infrastructure/messageBus/memory/MemoryMessageBusAdapter';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';
import { mock, MockProxy } from 'jest-mock-extended';

class TestDomainEvent extends DomainEvent {
  public static EVENT_NAME = 'test.event';

  public eventName(): string {
    return TestDomainEvent.EVENT_NAME;
  }
}

describe('MessageBus', () => {
  let amqpAdapter: MockProxy<AmqpMessageBusAdapter>;
  let memoryAdapter: MockProxy<MemoryMessageBusAdapter>;
  let heliaPubSubAdapter: MockProxy<HeliaPubSubMessageBusAdapter>;

  beforeEach(() => {
    amqpAdapter = mock<AmqpMessageBusAdapter>();
    memoryAdapter = mock<MemoryMessageBusAdapter>();
    heliaPubSubAdapter = mock<HeliaPubSubMessageBusAdapter>();
  });

  afterEach(() => {
    delete process.env.TRANSPORT_DSN;
  });

  it('should publish through the Helia PubSub adapter when configured', async () => {
    process.env.TRANSPORT_DSN = 'helia-pubsub://';
    const event = new TestDomainEvent('aggregate-id', {});
    const messageBus = new MessageBus(
      amqpAdapter,
      memoryAdapter,
      heliaPubSubAdapter,
    );

    await messageBus.publish([event]);

    expect(heliaPubSubAdapter.publish).toHaveBeenCalledWith([event]);
    expect(amqpAdapter.publish).not.toHaveBeenCalled();
    expect(memoryAdapter.publish).not.toHaveBeenCalled();
  });
});
