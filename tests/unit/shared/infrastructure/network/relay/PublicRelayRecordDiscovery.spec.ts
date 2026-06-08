jest.mock('@app/Kernel', () => ({
  __esModule: true,
  default: {
    logger: {
      debug: jest.fn(),
    },
  },
}));

import { Libp2pPubSubNode } from '../../../../../../src/shared/infrastructure/pubsub/libp2p/Libp2pPubSubNode';
import { PublicRelayRecordDiscovery } from '../../../../../../src/shared/infrastructure/network/relay/PublicRelayRecordDiscovery';
import { PublicRelayRecordPrimitives } from '../../../../../../src/shared/infrastructure/network/relay/PublicRelayRecordPrimitives';
import { PublicRelayRecordRegistry } from '../../../../../../src/shared/infrastructure/network/relay/PublicRelayRecordRegistry';
import { PublicRelayRecordSigner } from '../../../../../../src/shared/infrastructure/network/relay/PublicRelayRecordSigner';

describe('PublicRelayRecordDiscovery', () => {
  const relayPeerId =
    '12D3KooWFLpnXE1g65V26z5Lcw3Xia2e6HYetb6t1mGQARiStfk';
  const record: PublicRelayRecordPrimitives = {
    expiresAt: 2000,
    issuedAt: 1000,
    multiaddrs: [`/dns4/relay.test/tcp/4011/p2p/${relayPeerId}`],
    peerId: relayPeerId,
    publicKey: 'public-key',
    role: 'relay',
    signature: 'signature',
    version: 1,
  };
  let handlers: Array<(event: unknown) => void>;
  let node: Libp2pPubSubNode;
  let registry: PublicRelayRecordRegistry;
  let signer: jest.Mocked<PublicRelayRecordSigner>;

  beforeEach(() => {
    handlers = [];
    registry = new PublicRelayRecordRegistry();
    registry.clear();
    signer = {
      verify: jest.fn(async () => true),
    } as unknown as jest.Mocked<PublicRelayRecordSigner>;
    node = {
      services: {
        pubsub: {
          addEventListener: jest.fn((_eventName, handler) => {
            handlers.push(handler as (event: unknown) => void);
          }),
          publish: jest.fn(),
          subscribe: jest.fn(),
        },
      },
    };
  });

  it('should subscribe to public relay records and save valid records', async () => {
    await new PublicRelayRecordDiscovery(registry, signer).start(node);

    await emitRecord(record);

    expect(node.services.pubsub.subscribe).toHaveBeenCalledWith(
      'pigeon-swarm.public-relays.v1',
    );
    expect(registry.all(1500)).toEqual([record]);
  });

  it('should ignore records whose addresses do not belong to their peer id', async () => {
    await new PublicRelayRecordDiscovery(registry, signer).start(node);

    await emitRecord({
      ...record,
      multiaddrs: ['/dns4/relay.test/tcp/4011/p2p/12D3Other'],
    });

    expect(registry.all(1500)).toEqual([]);
  });

  it('should publish and save local relay records', async () => {
    await new PublicRelayRecordDiscovery(registry, signer).publish(node, record);

    expect(node.services.pubsub.publish).toHaveBeenCalledWith(
      'pigeon-swarm.public-relays.v1',
      expect.any(Uint8Array),
    );
    expect(registry.all(1500)).toEqual([record]);
  });

  it('should subscribe through a generic public pubsub connection', async () => {
    const subscribedHandlers = new Map<string, (payload: string) => void>();
    const connection = {
      publishPubSub: jest.fn(),
      subscribePubSub: jest.fn(
        async (
          topic: string,
          handler: (payload: string) => Promise<void>,
        ) => {
          subscribedHandlers.set(topic, (payload) => {
            void handler(payload);
          });
        },
      ),
    };

    await new PublicRelayRecordDiscovery(registry, signer).startConnection(
      connection,
    );
    subscribedHandlers.get('pigeon-swarm.public-relays.v1')?.(
      JSON.stringify(record),
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(connection.subscribePubSub).toHaveBeenCalledWith(
      'pigeon-swarm.public-relays.v1',
      expect.any(Function),
    );
    expect(registry.all(1500)).toEqual([record]);
  });

  it('should validate known active relay records', async () => {
    registry.save({
      ...record,
      expiresAt: Date.now() + 1000,
    });
    node.dial = jest.fn();

    await new PublicRelayRecordDiscovery(registry, signer).connectKnown(node);

    expect(signer.verify).toHaveBeenCalled();
  });

  async function emitRecord(
    relayRecord: PublicRelayRecordPrimitives,
  ): Promise<void> {
    handlers.forEach((handler) =>
      handler({
        detail: {
          data: new TextEncoder().encode(JSON.stringify(relayRecord)),
          topic: 'pigeon-swarm.public-relays.v1',
        },
      }),
    );
    await new Promise((resolve) => setImmediate(resolve));
  }
});
