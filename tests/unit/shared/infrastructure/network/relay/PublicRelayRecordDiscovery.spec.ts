import { Libp2pPubSubNode } from '../../../../../../src/shared/infrastructure/pubsub/libp2p/Libp2pPubSubNode';
import { PublicRelayRecordDiscovery } from '../../../../../../src/shared/infrastructure/network/relay/PublicRelayRecordDiscovery';
import { PublicRelayRecordPrimitives } from '../../../../../../src/shared/infrastructure/network/relay/PublicRelayRecordPrimitives';
import { PublicRelayRecordRegistry } from '../../../../../../src/shared/infrastructure/network/relay/PublicRelayRecordRegistry';
import { PublicRelayRecordSigner } from '../../../../../../src/shared/infrastructure/network/relay/PublicRelayRecordSigner';

describe('PublicRelayRecordDiscovery', () => {
  const record: PublicRelayRecordPrimitives = {
    expiresAt: 2000,
    issuedAt: 1000,
    multiaddrs: ['/dns4/relay.test/tcp/4011/p2p/12D3Relay'],
    peerId: '12D3Relay',
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
