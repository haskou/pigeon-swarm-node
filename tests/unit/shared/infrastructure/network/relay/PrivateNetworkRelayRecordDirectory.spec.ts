jest.mock('@app/Kernel', () => ({
  __esModule: true,
  default: {
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
    },
  },
}));

import { IPFSConnection } from '../../../../../../src/contexts/shared/infrastructure/ipfs/helia/IPFSConnection';
import { IPFSId } from '../../../../../../src/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import { IPFSNetwork } from '../../../../../../src/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { IPFSNetworkConfig } from '../../../../../../src/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import IPFSNetworkRegistry from '../../../../../../src/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { Libp2pPrivateKeyLike } from '../../../../../../src/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';
import { PrivateNetworkRelayRecordDirectory } from '../../../../../../src/shared/infrastructure/network/relay/PrivateNetworkRelayRecordDirectory';
import { PublicRelayRecordDiscovery } from '../../../../../../src/shared/infrastructure/network/relay/PublicRelayRecordDiscovery';
import { PublicRelayRecordPrimitives } from '../../../../../../src/shared/infrastructure/network/relay/PublicRelayRecordPrimitives';
import { PublicRelayRecordRegistry } from '../../../../../../src/shared/infrastructure/network/relay/PublicRelayRecordRegistry';
import { PublicRelayRecordSigner } from '../../../../../../src/shared/infrastructure/network/relay/PublicRelayRecordSigner';
import { Libp2pPubSubNode } from '../../../../../../src/shared/infrastructure/pubsub/libp2p/Libp2pPubSubNode';

describe('PrivateNetworkRelayRecordDirectory', () => {
  const networkKey =
    '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIGAjx38RTkT7ZsPCcTRgrTAWjBdk5+Pq+/a5h2dPLsw3\n-----END PRIVATE KEY-----\n';
  const relayRecord: PublicRelayRecordPrimitives = {
    expiresAt: 4102444800000,
    issuedAt: 1000,
    multiaddrs: [
      '/dns4/relay.test/tcp/4011/p2p/12D3KooWDHwUoxY5MSJaTP66sbsMCFZEQwVVHS5EtemUrxtFqNGp',
    ],
    peerId: '12D3KooWDHwUoxY5MSJaTP66sbsMCFZEQwVVHS5EtemUrxtFqNGp',
    publicKey: 'relay-public-key',
    role: 'relay',
    signature: 'relay-signature',
    version: 1,
  };

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should publish and discover relay records scoped by private network key', async () => {
    const publicConnection = new InMemoryPublicConnection();
    const registry = new PublicRelayRecordRegistry();

    registry.clear();
    await new PrivateNetworkRelayRecordDirectory(
      networkRegistry(privateNetwork(networkKey)),
      registry,
      undefined,
      async () => publicConnection,
      ipnsKeyGenerator,
    ).publish(relayRecord);

    expect(publicConnection.serializedRecords()).not.toContain(
      relayRecord.peerId,
    );
    expect(publicConnection.serializedRecords()).not.toContain(
      relayRecord.publicKey,
    );
    expect(publicConnection.serializedRecords()).not.toContain(
      relayRecord.multiaddrs[0],
    );
    expect(publicConnection.serializedJSON()).not.toContain(
      relayRecord.peerId,
    );
    expect(publicConnection.serializedJSON()).not.toContain(
      relayRecord.publicKey,
    );
    expect(publicConnection.serializedJSON()).not.toContain(
      relayRecord.multiaddrs[0],
    );
    expect(publicConnection.addedJSONCount()).toBe(1);

    const discovered = await new PrivateNetworkRelayRecordDirectory(
      networkRegistry(privateNetwork(networkKey)),
      registry,
      undefined,
      async () => publicConnection,
      ipnsKeyGenerator,
    ).discover();

    expect(discovered).toEqual([relayRecord]);
    expect(registry.all(1500)).toEqual([relayRecord]);
  });

  it('should ignore relay records published for another private network key', async () => {
    const publicConnection = new InMemoryPublicConnection();
    const registry = new PublicRelayRecordRegistry();

    registry.clear();
    await new PrivateNetworkRelayRecordDirectory(
      networkRegistry(privateNetwork(networkKey)),
      registry,
      undefined,
      async () => publicConnection,
      ipnsKeyGenerator,
    ).publish(relayRecord);

    const discovered = await new PrivateNetworkRelayRecordDirectory(
      networkRegistry(
        privateNetwork(
          '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIGAjx38RTkT7ZsPCcTRgrTAWjBdk5+Pq+/a5h2dPLsw4\n-----END PRIVATE KEY-----\n',
        ),
      ),
      registry,
      undefined,
      async () => publicConnection,
      ipnsKeyGenerator,
    ).discover();

    expect(discovered).toEqual([]);
  });

  it('should let a leaf node discover relay records from the private directory', async () => {
    const publicConnection = new InMemoryPublicConnection();
    const relayRegistry = new PublicRelayRecordRegistry();
    const leafRegistry = new PublicRelayRecordRegistry();
    const leafNode = {
      dial: jest.fn(),
      services: {
        pubsub: {
          addEventListener: jest.fn(),
          publish: jest.fn(),
          subscribe: jest.fn(),
        },
      },
    } as unknown as Libp2pPubSubNode;
    const signer = {
      verify: jest.fn(async () => true),
    } as unknown as PublicRelayRecordSigner;

    relayRegistry.clear();
    leafRegistry.clear();
    await new PrivateNetworkRelayRecordDirectory(
      networkRegistry(privateNetwork(networkKey)),
      relayRegistry,
      undefined,
      async () => publicConnection,
      ipnsKeyGenerator,
    ).publish(relayRecord);

    const discovered = await new PrivateNetworkRelayRecordDirectory(
      networkRegistry(privateNetwork(networkKey)),
      leafRegistry,
      undefined,
      async () => publicConnection,
      ipnsKeyGenerator,
    ).discover();

    expect(discovered).toEqual([relayRecord]);
    expect(leafRegistry.all()).toEqual([relayRecord]);

    await new PublicRelayRecordDiscovery(leafRegistry, signer).connectKnown(
      leafNode,
    );

    expect(signer.verify).toHaveBeenCalledWith(
      relayRecord,
      relayRecord.signature,
    );
  });

  it('should ignore relay provider multiaddrs when custom DHT records are unavailable', async () => {
    const publicConnection = new InMemoryPublicConnection();
    const registry = new PublicRelayRecordRegistry();
    const publisher = new PrivateNetworkRelayRecordDirectory(
      networkRegistry(privateNetwork(networkKey)),
      new PublicRelayRecordRegistry(),
      undefined,
      async () => publicConnection,
      ipnsKeyGenerator,
    );

    registry.clear();
    await publisher.publish(relayRecord);
    publicConnection.clearRecords();
    publicConnection.clearIPNSRecords();

    const discovered = await new PrivateNetworkRelayRecordDirectory(
      networkRegistry(privateNetwork(networkKey)),
      registry,
      undefined,
      async () => publicConnection,
      ipnsKeyGenerator,
    ).discover();

    expect(discovered).toEqual([]);
    expect(registry.all()).toEqual([]);
  });

  it('should discover relay records from the deterministic IPNS directory when custom DHT records are unavailable', async () => {
    const publicConnection = new InMemoryPublicConnection();
    const registry = new PublicRelayRecordRegistry();
    const publisher = new PrivateNetworkRelayRecordDirectory(
      networkRegistry(privateNetwork(networkKey)),
      new PublicRelayRecordRegistry(),
      undefined,
      async () => publicConnection,
      ipnsKeyGenerator,
    );

    registry.clear();
    await publisher.publish(relayRecord);
    publicConnection.clearRecords();

    const discovered = await new PrivateNetworkRelayRecordDirectory(
      networkRegistry(privateNetwork(networkKey)),
      registry,
      undefined,
      async () => publicConnection,
      ipnsKeyGenerator,
    ).discover();

    expect(discovered).toEqual([relayRecord]);
    expect(registry.all()).toEqual([relayRecord]);
  });

  it('should discover relay records from encrypted public pubsub envelopes', async () => {
    const publicConnection = new InMemoryPublicConnection();
    const registry = new PublicRelayRecordRegistry();
    const leafDirectory = new PrivateNetworkRelayRecordDirectory(
      networkRegistry(privateNetwork(networkKey)),
      registry,
      undefined,
      async () => publicConnection,
      ipnsKeyGenerator,
    );

    registry.clear();
    await leafDirectory.discover();

    await new PrivateNetworkRelayRecordDirectory(
      networkRegistry(privateNetwork(networkKey)),
      new PublicRelayRecordRegistry(),
      undefined,
      async () => publicConnection,
      ipnsKeyGenerator,
    ).publish(relayRecord);

    expect(registry.all()).toEqual([relayRecord]);
  });

  it('should refresh private relay discovery periodically', async () => {
    jest.useFakeTimers();
    const publicConnection = new InMemoryPublicConnection();
    const directory = new PrivateNetworkRelayRecordDirectory(
      networkRegistry(privateNetwork(networkKey)),
      new PublicRelayRecordRegistry(),
      undefined,
      async () => publicConnection,
      ipnsKeyGenerator,
    );
    const discover = jest.spyOn(directory, 'discover');

    await directory.startDiscoveryRefresh(1000);
    jest.advanceTimersByTime(1000);
    await Promise.resolve();

    expect(discover).toHaveBeenCalledTimes(2);
  });

  function privateNetwork(key: string): IPFSNetwork {
    return new IPFSNetwork(
      IPFSNetworkConfig.fromPrimitives({
        id: '550e8400-e29b-41d4-a716-446655440123',
        key,
        name: 'private',
      }),
      {} as never,
    );
  }

  function networkRegistry(network: IPFSNetwork): IPFSNetworkRegistry {
    return new SingleNetworkRegistry(network) as unknown as IPFSNetworkRegistry;
  }

  function ipnsKeyGenerator(seed: Uint8Array): Promise<Libp2pPrivateKeyLike> {
    const name = `ipns-${Buffer.from(seed).toString('base64url')}`;

    return Promise.resolve({
      publicKey: {
        toString: () => name,
      },
    } as Libp2pPrivateKeyLike);
  }
});

class SingleNetworkRegistry implements Partial<IPFSNetworkRegistry> {
  public constructor(private readonly network: IPFSNetwork) {}

  public getAll(): IPFSNetwork[] {
    return [this.network];
  }

  public getSharedPeerPrivateKey(): never {
    throw new Error('Shared private key should not be requested in this test.');
  }

  public onNetworkRegistered(): void {}
}

class InMemoryPublicConnection implements IPFSConnection {
  private readonly json = new Map<string, unknown>();

  private readonly ipnsRecords = new Map<string, string>();
  private readonly records = new Map<string, string>();
  private readonly providerMultiaddrs = new Map<string, string[]>();
  private readonly pubsubHandlers = new Map<
    string,
    ((payload: string) => Promise<void>)[]
  >();
  private providerMultiaddrOverride?: string[];

  public stat(): Promise<void> {
    return Promise.resolve();
  }

  public addBytes(): Promise<IPFSId> {
    throw new Error('Not implemented.');
  }

  public getBytes(): Promise<Buffer> {
    throw new Error('Not implemented.');
  }

  public addJSON(data: unknown): Promise<IPFSId> {
    const cid = new IPFSId(`bafy-private-relay-record-${this.json.size}`);

    this.json.set(cid.valueOf(), data);

    return Promise.resolve(cid);
  }

  public removeJSON(cid: IPFSId): Promise<void> {
    this.json.delete(cid.valueOf());

    return Promise.resolve();
  }

  public getJSON<T>(cid: IPFSId): Promise<T> {
    return Promise.resolve(this.json.get(cid.valueOf()) as T);
  }

  public serializedJSON(): string {
    return JSON.stringify([...this.json.values()]);
  }

  public serializedRecords(): string {
    return JSON.stringify([...this.records.values()]);
  }

  public clearRecords(): void {
    this.records.clear();
  }

  public clearIPNSRecords(): void {
    this.ipnsRecords.clear();
  }

  public setProviderMultiaddrs(multiaddrs: string[]): void {
    this.providerMultiaddrOverride = multiaddrs;
  }

  public addedJSONCount(): number {
    return this.json.size;
  }

  public putRecord(key: string, value: string): Promise<void> {
    this.records.set(key, value);

    return Promise.resolve();
  }

  public getRecord(key: string): Promise<string | undefined> {
    return Promise.resolve(this.records.get(key));
  }

  public publishIPNSRecord(
    privateKey: Libp2pPrivateKeyLike,
    value: string,
  ): Promise<string> {
    const name = privateKey.publicKey.toString();

    this.ipnsRecords.set(name, value);

    return Promise.resolve(name);
  }

  public resolveIPNSRecord(
    privateKey: Libp2pPrivateKeyLike,
  ): Promise<string | undefined> {
    return Promise.resolve(
      this.ipnsRecords.get(privateKey.publicKey.toString()),
    );
  }

  public provideRecord(key: string): Promise<void> {
    this.providerMultiaddrs.set(key, [
      '/dns4/relay.test/tcp/4011/p2p/12D3KooWDHwUoxY5MSJaTP66sbsMCFZEQwVVHS5EtemUrxtFqNGp',
    ]);

    return Promise.resolve();
  }

  public findRecordProviderMultiaddrs(key: string): Promise<string[]> {
    if (this.providerMultiaddrOverride) {
      return Promise.resolve(this.providerMultiaddrOverride);
    }

    return Promise.resolve(this.providerMultiaddrs.get(key) || []);
  }

  public async publishPubSub(topic: string, payload: string): Promise<void> {
    await Promise.all(
      (this.pubsubHandlers.get(topic) || []).map((handler) =>
        handler(payload),
      ),
    );
  }

  public subscribePubSub(
    topic: string,
    handler: (payload: string) => Promise<void>,
  ): Promise<void> {
    this.pubsubHandlers.set(topic, [
      ...(this.pubsubHandlers.get(topic) || []),
      handler,
    ]);

    return Promise.resolve();
  }

  public blockPeer(): Promise<void> {
    return Promise.resolve();
  }

  public getPeers(): string[] {
    return [];
  }

  public getPeerId(): string {
    return 'public-peer';
  }

  public stop(): Promise<void> {
    return Promise.resolve();
  }
}
