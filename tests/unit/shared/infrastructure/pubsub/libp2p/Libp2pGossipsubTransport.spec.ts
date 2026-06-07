import Libp2pGossipsubTransport from '@app/shared/infrastructure/pubsub/libp2p/Libp2pGossipsubTransport';
import { Libp2pGossipsubRuntimeAdapter } from '@app/shared/infrastructure/pubsub/libp2p/Libp2pGossipsubRuntimeAdapter';
import { Libp2pPubSubNode } from '@app/shared/infrastructure/pubsub/libp2p/Libp2pPubSubNode';
import { PubSubEvent } from '@app/shared/infrastructure/pubsub/libp2p/PubSubEvent';
import { mock, MockProxy } from 'jest-mock-extended';

describe('Libp2pGossipsubTransport', () => {
  let runtimeAdapter: MockProxy<Libp2pGossipsubRuntimeAdapter>;
  let node: Libp2pPubSubNode;
  let transport: Libp2pGossipsubTransport;

  beforeEach(() => {
    runtimeAdapter = mock<Libp2pGossipsubRuntimeAdapter>();
    node = {
      services: {
        pubsub: {
          addEventListener: jest.fn(),
          publish: jest.fn(),
          subscribe: jest.fn(),
        },
      },
    };
    runtimeAdapter.createNode.mockResolvedValue(node);
    transport = new Libp2pGossipsubTransport(runtimeAdapter);
  });

  it('should publish encoded payloads through the PubSub node', async () => {
    await transport.publish('pigeon.identities', 'payload');

    expect(node.services.pubsub.publish).toHaveBeenCalledWith(
      'pigeon.identities',
      new TextEncoder().encode('payload'),
    );
  });

  it('should subscribe and decode matching PubSub messages', async () => {
    const handler = jest.fn();

    await transport.subscribe('pigeon.identities', handler);

    const listener = (node.services.pubsub.addEventListener as jest.Mock).mock
      .calls[0][1] as (event: PubSubEvent) => void;

    listener(
      new CustomEvent('message', {
        detail: {
          data: new TextEncoder().encode('payload'),
          topic: 'pigeon.identities',
        },
      }),
    );

    await new Promise((resolve) => setImmediate(resolve));

    expect(node.services.pubsub.subscribe).toHaveBeenCalledWith(
      'pigeon.identities',
    );
    expect(handler).toHaveBeenCalledWith('payload');
  });
});
