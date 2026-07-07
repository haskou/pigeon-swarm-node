import { DomainEvent } from '@haskou/ddd-kernel/domain';
import Libp2pGossipsubAdapter from '@app/shared/infrastructure/messageBus/libp2p/Libp2pGossipsubMessageBusAdapter';
import MemoryMessageBusAdapter from '@app/shared/infrastructure/messageBus/memory/MemoryMessageBusAdapter';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';
import { webSocketEventHub } from '@app/shared/infrastructure/websocket/WebSocketEventHub';
import { mock, MockProxy } from 'jest-mock-extended';

class TestDomainEvent extends DomainEvent {
  public static EVENT_NAME = 'test.event';

  public eventName(): string {
    return TestDomainEvent.EVENT_NAME;
  }
}

describe('MessageBus', () => {
  let memoryAdapter: MockProxy<MemoryMessageBusAdapter>;
  let libp2pGossipsubAdapter: MockProxy<Libp2pGossipsubAdapter>;

  beforeEach(() => {
    memoryAdapter = mock<MemoryMessageBusAdapter>();
    libp2pGossipsubAdapter = mock<Libp2pGossipsubAdapter>();
  });

  afterEach(() => {
    delete process.env.TRANSPORT_DSN;
    jest.restoreAllMocks();
  });

  it('should publish through the Libp2p Gossipsub adapter when configured', async () => {
    process.env.TRANSPORT_DSN = 'libp2p-gossipsub://';
    const event = new TestDomainEvent('aggregate-id', {});
    const websocketPublish = jest
      .spyOn(webSocketEventHub, 'publish')
      .mockImplementation();
    const messageBus = new MessageBus(
      memoryAdapter,
      libp2pGossipsubAdapter,
    );

    await messageBus.publish([event]);

    expect(libp2pGossipsubAdapter.publish).toHaveBeenCalledWith([event]);
    expect(websocketPublish).toHaveBeenCalledWith([event]);
    expect(memoryAdapter.publish).not.toHaveBeenCalled();
  });

  it('should not wait for transport side effects before returning', async () => {
    process.env.TRANSPORT_DSN = 'libp2p-gossipsub://';
    const event = new TestDomainEvent('aggregate-id', {});
    const websocketPublish = jest
      .spyOn(webSocketEventHub, 'publish')
      .mockImplementation();
    const messageBus = new MessageBus(
      memoryAdapter,
      libp2pGossipsubAdapter,
    );

    libp2pGossipsubAdapter.publish.mockReturnValue(
      new Promise(() => undefined),
    );

    await expect(messageBus.publish([event])).resolves.toBeUndefined();

    expect(libp2pGossipsubAdapter.publish).toHaveBeenCalledWith([event]);
    expect(websocketPublish).toHaveBeenCalledWith([event]);
  });

  it('should not wait for in-memory transport side effects before returning', async () => {
    process.env.TRANSPORT_DSN = 'in-memory://';
    const event = new TestDomainEvent('aggregate-id', {
      value: 'payload',
    });
    const websocketPublish = jest
      .spyOn(webSocketEventHub, 'publish')
      .mockImplementation();
    const messageBus = new MessageBus(
      memoryAdapter,
      libp2pGossipsubAdapter,
    );

    memoryAdapter.publish.mockReturnValue(new Promise(() => undefined));

    await expect(messageBus.publish([event])).resolves.toBeUndefined();

    expect(memoryAdapter.publish).toHaveBeenCalledWith([event]);
    expect(websocketPublish).toHaveBeenCalledWith([event]);
  });
});
