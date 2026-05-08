import HeliaPubSubTransport from '@app/shared/infrastructure/pubsub/helia/HeliaPubSubTransport';
import {
  HeliaPubSubRuntimeAdapter,
  Libp2pPubSubNode,
  PubSubEvent,
} from '@app/shared/infrastructure/pubsub/helia/HeliaPubSubRuntimeAdapter';
import { mock, MockProxy } from 'jest-mock-extended';

describe('HeliaPubSubTransport', () => {
  let runtimeAdapter: MockProxy<HeliaPubSubRuntimeAdapter>;
  let node: Libp2pPubSubNode;
  let transport: HeliaPubSubTransport;

  beforeEach(() => {
    runtimeAdapter = mock<HeliaPubSubRuntimeAdapter>();
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
    transport = new HeliaPubSubTransport(runtimeAdapter);
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

    const listener = (
      node.services.pubsub.addEventListener as jest.Mock
    ).mock.calls[0][1] as (event: PubSubEvent) => void;

    listener(
      new CustomEvent('message', {
        detail: {
          data: new TextEncoder().encode('payload'),
          topic: 'pigeon.identities',
        },
      }),
    );

    await Promise.resolve();

    expect(node.services.pubsub.subscribe).toHaveBeenCalledWith(
      'pigeon.identities',
    );
    expect(handler).toHaveBeenCalledWith('payload');
  });
});
