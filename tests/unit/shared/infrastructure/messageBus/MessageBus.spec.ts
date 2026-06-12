import DomainEvent from '@app/shared/domain/events/DomainEvent';
import AmqpMessageBusAdapter from '@app/shared/infrastructure/messageBus/amqp/AmqpMessageBusAdapter';
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
    MessageBus.clearReplicatedEventPublisher();
    jest.restoreAllMocks();
  });

  it('should publish through the Libp2p Gossipsub adapter when configured', async () => {
    process.env.TRANSPORT_DSN = 'libp2p-gossipsub://';
    const event = new TestDomainEvent('aggregate-id', {});
    const websocketPublish = jest
      .spyOn(webSocketEventHub, 'publish')
      .mockImplementation();
    const messageBus = new MessageBus(
      amqpAdapter,
      memoryAdapter,
      libp2pGossipsubAdapter,
    );

    await messageBus.publish([event]);

    expect(libp2pGossipsubAdapter.publish).toHaveBeenCalledWith([event]);
    expect(websocketPublish).toHaveBeenCalledWith([event]);
    expect(amqpAdapter.publish).not.toHaveBeenCalled();
    expect(memoryAdapter.publish).not.toHaveBeenCalled();
  });

  it('should publish local events to the replicated event publisher', async () => {
    process.env.TRANSPORT_DSN = 'in-memory://';
    const event = new TestDomainEvent('aggregate-id', {
      value: 'payload',
    });
    const replicatedEventPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    };
    const messageBus = new MessageBus(
      amqpAdapter,
      memoryAdapter,
      libp2pGossipsubAdapter,
    );

    MessageBus.setReplicatedEventPublisher(replicatedEventPublisher);
    await messageBus.publish([event]);

    expect(replicatedEventPublisher.publish).toHaveBeenCalledWith([event]);
  });

  it('should dispatch replicated events through local consumers and websocket projections', async () => {
    process.env.TRANSPORT_DSN = 'in-memory://';
    const handler = jest.fn().mockResolvedValue(undefined);
    const websocketPublish = jest
      .spyOn(webSocketEventHub, 'publish')
      .mockImplementation();
    const messageBus = new MessageBus(
      amqpAdapter,
      memoryAdapter,
      libp2pGossipsubAdapter,
    );

    await messageBus.consume(
      'test.queue',
      TestDomainEvent.EVENT_NAME,
      TestDomainEvent,
      'domain_events',
      handler,
    );
    await messageBus.dispatchReplicated({
      aggregate_id: 'aggregate-id',
      attributes: {
        value: 'payload',
      },
      event: TestDomainEvent.EVENT_NAME,
      event_id: 'event-id',
      exchange: 'domain_events',
      occurred_on: 1780000000000,
      retries: 0,
      routingKey: TestDomainEvent.EVENT_NAME,
      type: TestDomainEvent.EVENT_NAME,
      user_id: '',
    });

    expect(handler).toHaveBeenCalledWith(expect.any(TestDomainEvent));
    expect(handler.mock.calls[0][0].attributes).toEqual({ value: 'payload' });
    expect(websocketPublish).toHaveBeenCalledWith([expect.any(TestDomainEvent)]);
  });

  it('should dispatch registered replicated events to websocket without a consumer', async () => {
    process.env.TRANSPORT_DSN = 'in-memory://';
    const websocketPublish = jest
      .spyOn(webSocketEventHub, 'publish')
      .mockImplementation();
    const messageBus = new MessageBus(
      amqpAdapter,
      memoryAdapter,
      libp2pGossipsubAdapter,
    );

    messageBus.registerEventType(TestDomainEvent.EVENT_NAME, TestDomainEvent);
    await messageBus.dispatchReplicated({
      aggregate_id: 'aggregate-id',
      attributes: {
        value: 'payload',
      },
      event: TestDomainEvent.EVENT_NAME,
      event_id: 'event-id',
      exchange: 'domain_events',
      occurred_on: 1780000000000,
      retries: 0,
      routingKey: TestDomainEvent.EVENT_NAME,
      type: TestDomainEvent.EVENT_NAME,
      user_id: '',
    });

    expect(websocketPublish).toHaveBeenCalledWith([expect.any(TestDomainEvent)]);
    expect(
      (websocketPublish.mock.calls[0][0][0] as TestDomainEvent).attributes,
    ).toEqual({ value: 'payload' });
  });
});
