import DomainEvent from '@app/shared/domain/events/DomainEvent';
import AmqpMessageBusAdapter from '@app/shared/infrastructure/messageBus/amqp/AmqpMessageBusAdapter';
import Libp2pGossipsubAdapter from '@app/shared/infrastructure/messageBus/libp2p/Libp2pGossipsubMessageBusAdapter';
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
  let libp2pGossipsubAdapter: MockProxy<Libp2pGossipsubAdapter>;

  beforeEach(() => {
    amqpAdapter = mock<AmqpMessageBusAdapter>();
    memoryAdapter = mock<MemoryMessageBusAdapter>();
    libp2pGossipsubAdapter = mock<Libp2pGossipsubAdapter>();
  });

  afterEach(() => {
    delete process.env.TRANSPORT_DSN;
  });

  it('should publish through the Libp2p Gossipsub adapter when configured', async () => {
    process.env.TRANSPORT_DSN = 'libp2p-gossipsub://';
    const event = new TestDomainEvent('aggregate-id', {});
    const messageBus = new MessageBus(
      amqpAdapter,
      memoryAdapter,
      libp2pGossipsubAdapter,
    );

    await messageBus.publish([event]);

    expect(libp2pGossipsubAdapter.publish).toHaveBeenCalledWith([event]);
    expect(amqpAdapter.publish).not.toHaveBeenCalled();
    expect(memoryAdapter.publish).not.toHaveBeenCalled();
  });
});
