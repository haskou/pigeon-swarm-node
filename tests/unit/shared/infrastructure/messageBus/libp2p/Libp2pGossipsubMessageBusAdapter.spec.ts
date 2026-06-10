import DomainEvent from '@app/shared/domain/events/DomainEvent';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import Libp2pGossipsubAdapter from '@app/shared/infrastructure/messageBus/libp2p/Libp2pGossipsubMessageBusAdapter';
import PubSubNetworkMessageCodec from '@app/shared/infrastructure/messageBus/libp2p/PubSubNetworkMessageCodec';
import PubSubTopicResolver from '@app/shared/infrastructure/messageBus/libp2p/PubSubTopicResolver';
import PubSubTransport from '@app/shared/infrastructure/pubsub/PubSubTransport';
import { webSocketEventHub } from '@app/shared/infrastructure/websocket/WebSocketEventHub';
import { PrivateKey } from '@haskou/value-objects';
import { mock, MockProxy } from 'jest-mock-extended';

class TestDomainEvent extends DomainEvent {
  public static EVENT_NAME = 'identities.v1.identity.was_created';

  public eventName(): string {
    return TestDomainEvent.EVENT_NAME;
  }
}

class OtherIdentityDomainEvent extends DomainEvent {
  public static EVENT_NAME = 'identities.v1.identity.was_updated';

  public eventName(): string {
    return OtherIdentityDomainEvent.EVENT_NAME;
  }
}

describe('Libp2pGossipsubAdapter', () => {
  let transport: MockProxy<PubSubTransport>;
  let networkRegistry: MockProxy<IPFSNetworkRegistry>;
  let adapter: Libp2pGossipsubAdapter;

  const createNetwork = (options: {
    id: string;
    isPrivate?: boolean;
  }): MockProxy<IPFSNetwork> => {
    const network = mock<IPFSNetwork>();
    const key = options.isPrivate
      ? mock<PrivateKey>({
          valueOf: () => 'private-network-key',
        })
      : undefined;

    network.getId.mockReturnValue(options.id);
    network.isPrivate.mockReturnValue(Boolean(options.isPrivate));
    network.getConfig.mockReturnValue({
      getKey: () => key,
    } as never);

    return network;
  };

  const createAdapter = (): Libp2pGossipsubAdapter =>
    new Libp2pGossipsubAdapter(
      transport,
      networkRegistry,
      new PubSubTopicResolver(),
      new PubSubNetworkMessageCodec(),
    );

  beforeEach(() => {
    transport = mock<PubSubTransport>();
    networkRegistry = mock<IPFSNetworkRegistry>();
    networkRegistry.getAll.mockReturnValue([]);
    adapter = createAdapter();
  });

  it('should publish domain events to pubsub topics', async () => {
    const event = new TestDomainEvent('aggregate-id', { name: 'alice' });

    await adapter.publish([event]);

    expect(transport.publish).toHaveBeenCalledWith(
      'pigeon-swarm.identities.v1.announcements',
      event.decode(),
    );
  });

  it('should consume pubsub payloads as domain events', async () => {
    const handler = jest.fn();
    const event = new TestDomainEvent('aggregate-id', { name: 'alice' });

    transport.subscribe.mockImplementation(async (_topic, callback) => {
      await callback(event.decode());
    });

    await adapter.consume(
      'queue',
      TestDomainEvent.EVENT_NAME,
      TestDomainEvent,
      'test-service',
      handler,
    );

    expect(transport.subscribe).toHaveBeenCalledWith(
      'pigeon-swarm.identities.v1.announcements',
      expect.any(Function),
    );
    expect(handler).toHaveBeenCalledWith(expect.any(TestDomainEvent));
    expect(handler.mock.calls[0][0].toPrimitives).toBeUndefined();
    expect(handler.mock.calls[0][0].aggregateId).toBe('aggregate-id');
  });

  it('should ignore other events published on the same context topic', async () => {
    const handler = jest.fn();
    const expectedEvent = new TestDomainEvent('aggregate-id');
    const otherEvent = new OtherIdentityDomainEvent('other-aggregate-id');

    transport.subscribe.mockImplementation(async (_topic, callback) => {
      await callback(otherEvent.decode());
      await callback(expectedEvent.decode());
    });

    await adapter.consume(
      'queue',
      TestDomainEvent.EVENT_NAME,
      TestDomainEvent,
      'test-service',
      handler,
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].aggregateId).toBe('aggregate-id');
  });

  it('should publish domain events to every registered network topic', async () => {
    const publicNetwork = createNetwork({ id: 'public-network-id' });
    const privateNetwork = createNetwork({
      id: 'private-network-id',
      isPrivate: true,
    });
    const event = new TestDomainEvent('aggregate-id', { name: 'alice' });

    networkRegistry.getAll.mockReturnValue([publicNetwork, privateNetwork]);
    adapter = createAdapter();

    await adapter.publish([event]);

    expect(publicNetwork.publishPubSub).toHaveBeenCalledWith(
      'pigeon-swarm.networks.public-network-id.identities.v1.announcements',
      expect.stringContaining('"encrypted":false'),
    );
    expect(privateNetwork.publishPubSub).toHaveBeenCalledWith(
      'pigeon-swarm.networks.private-network-id.identities.v1.announcements',
      expect.stringContaining('"encrypted":true'),
    );
  });

  it('should consume private network payloads after decrypting them', async () => {
    const handler = jest.fn();
    const privateNetwork = createNetwork({
      id: 'private-network-id',
      isPrivate: true,
    });
    const event = new TestDomainEvent('aggregate-id', { name: 'alice' });
    let subscribedHandler: ((payload: string) => Promise<void>) | undefined;

    networkRegistry.getAll.mockReturnValue([privateNetwork]);
    privateNetwork.subscribePubSub.mockImplementation(
      async (_topic, callback) => {
        subscribedHandler = callback;
      },
    );
    adapter = createAdapter();

    await adapter.consume(
      'queue',
      TestDomainEvent.EVENT_NAME,
      TestDomainEvent,
      'test-service',
      handler,
    );
    await adapter.publish([event]);

    const encryptedPayload = privateNetwork.publishPubSub.mock.calls[0][1];

    await subscribedHandler?.(encryptedPayload);

    expect(privateNetwork.subscribePubSub).toHaveBeenCalledWith(
      'pigeon-swarm.networks.private-network-id.identities.v1.announcements',
      expect.any(Function),
    );
    expect(handler).toHaveBeenCalledWith(expect.any(TestDomainEvent));
    expect(handler.mock.calls[0][0].aggregateId).toBe('aggregate-id');
  });

  it('should publish network payloads to websockets after consumers accept them', async () => {
    const handler = jest.fn();
    const network = createNetwork({ id: 'network-id' });
    const event = new TestDomainEvent('aggregate-id', { name: 'alice' });
    const publishSpy = jest
      .spyOn(webSocketEventHub, 'publish')
      .mockImplementation(() => undefined);
    let subscribedHandler: ((payload: string) => Promise<void>) | undefined;

    networkRegistry.getAll.mockReturnValue([network]);
    network.subscribePubSub.mockImplementation(async (_topic, callback) => {
      subscribedHandler = callback;
    });
    adapter = createAdapter();

    await adapter.consume(
      'queue',
      TestDomainEvent.EVENT_NAME,
      TestDomainEvent,
      'test-service',
      handler,
    );
    await adapter.publish([event]);
    await subscribedHandler?.(network.publishPubSub.mock.calls[0][1]);

    expect(handler).toHaveBeenCalledWith(expect.any(TestDomainEvent));
    expect(publishSpy).toHaveBeenCalledWith([expect.any(TestDomainEvent)]);

    publishSpy.mockRestore();
  });

  it('should not publish rejected network payloads to websockets', async () => {
    const expectedError = new Error('rejected remote event');
    const handler = jest.fn().mockRejectedValue(expectedError);
    const network = createNetwork({ id: 'network-id' });
    const event = new TestDomainEvent('aggregate-id', { name: 'alice' });
    const publishSpy = jest
      .spyOn(webSocketEventHub, 'publish')
      .mockImplementation(() => undefined);
    let subscribedHandler: ((payload: string) => Promise<void>) | undefined;

    networkRegistry.getAll.mockReturnValue([network]);
    network.subscribePubSub.mockImplementation(async (_topic, callback) => {
      subscribedHandler = callback;
    });
    adapter = createAdapter();

    await adapter.consume(
      'queue',
      TestDomainEvent.EVENT_NAME,
      TestDomainEvent,
      'test-service',
      handler,
    );
    await adapter.publish([event]);

    await expect(
      subscribedHandler?.(network.publishPubSub.mock.calls[0][1]),
    ).rejects.toBe(expectedError);

    expect(publishSpy).not.toHaveBeenCalled();

    publishSpy.mockRestore();
  });

  it('should fan out network payloads to every consumer on the same topic', async () => {
    const firstHandler = jest.fn();
    const secondHandler = jest.fn();
    const network = createNetwork({ id: 'network-id' });
    const event = new TestDomainEvent('aggregate-id', { name: 'alice' });
    let subscribedHandler: ((payload: string) => Promise<void>) | undefined;

    networkRegistry.getAll.mockReturnValue([network]);
    network.subscribePubSub.mockImplementation(async (_topic, callback) => {
      subscribedHandler = callback;
    });
    adapter = createAdapter();

    await adapter.consume(
      'queue-a',
      TestDomainEvent.EVENT_NAME,
      TestDomainEvent,
      'test-service',
      firstHandler,
    );
    await adapter.consume(
      'queue-b',
      TestDomainEvent.EVENT_NAME,
      TestDomainEvent,
      'test-service',
      secondHandler,
    );
    await adapter.publish([event]);

    await subscribedHandler?.(network.publishPubSub.mock.calls[0][1]);

    expect(network.subscribePubSub).toHaveBeenCalledTimes(1);
    expect(firstHandler).toHaveBeenCalledWith(expect.any(TestDomainEvent));
    expect(secondHandler).toHaveBeenCalledWith(expect.any(TestDomainEvent));
  });
});
