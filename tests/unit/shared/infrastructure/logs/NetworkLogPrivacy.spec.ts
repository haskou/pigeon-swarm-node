import type { OrbitDBDatabase } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBDatabase';
import type { Multiaddr } from '@multiformats/multiaddr';

import OrbitDBReplicatedStateRuntime from '@app/apps/runtimes/orbitdb-runtime/OrbitDBReplicatedStateRuntime';
import NodeNetworkSynchronizationMonitor from '@app/contexts/nodes/application/find-network-synchronization/NodeNetworkSynchronizationMonitor';
import {
  heliaRuntimeAdapter,
  HeliaInstance,
} from '@app/contexts/shared/infrastructure/ipfs/helia/adapters/HeliaRuntimeAdapter';
import { HeliaIPFS } from '@app/contexts/shared/infrastructure/ipfs/helia/HeliaIPFS';
import { HeliaIPFSParser } from '@app/contexts/shared/infrastructure/ipfs/helia/HeliaIPFSParser';
import { IPFSConnection } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSConnection';
import { libp2pKeyAdapter } from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { IPFSNetworkConfig } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { PublicIPFS } from '@app/contexts/shared/infrastructure/ipfs/networks/PublicIPFS';
import { OrbitDBPrivateNetworkStores } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBPrivateNetworkStores';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import WinstonLogger from '@app/shared/infrastructure/logs/WinstonLogger';
import PrivateNetworkRelayDirectorySettings from '@app/shared/infrastructure/network/relay/PrivateNetworkRelayDirectorySettings';
import PrivateNetworkRelayRecordCodec from '@app/shared/infrastructure/network/relay/PrivateNetworkRelayRecordCodec';
import PrivateNetworkRelayRecordDirectory from '@app/shared/infrastructure/network/relay/PrivateNetworkRelayRecordDirectory';
import { PrivateRelayRecordCacheDocument } from '@app/shared/infrastructure/network/relay/PrivateRelayRecordCacheDocument';
import { PublicRelayRecordDiscovery } from '@app/shared/infrastructure/network/relay/PublicRelayRecordDiscovery';
import { PublicRelayRecordPrimitives } from '@app/shared/infrastructure/network/relay/PublicRelayRecordPrimitives';
import { PublicRelayRecordRegistry } from '@app/shared/infrastructure/network/relay/PublicRelayRecordRegistry';
import { PublicRelayRecordSigner } from '@app/shared/infrastructure/network/relay/PublicRelayRecordSigner';
import { Libp2pPubSubNode } from '@app/shared/infrastructure/pubsub/libp2p/Libp2pPubSubNode';
import Kernel from '@haskou/ddd-kernel';
import { PrivateKey } from '@haskou/pigeon-swarm-crypto';
import { generateKeyPairSync } from 'crypto';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import { mock } from 'jest-mock-extended';
import os from 'os';
import path from 'path';
import winston from 'winston';

const NETWORK_ID = 'PRIVATE-NETWORK-ID';
const NETWORK_NAME = 'PRIVATE-NETWORK-NAME';
const REMOTE_HOST = 'remote-relay.private.example';
const REMOTE_PEER_ID = '12D3KooWRemotePrivatePeer';
const REMOTE_MULTIADDR = `/dns4/${REMOTE_HOST}/tcp/4181/p2p/${REMOTE_PEER_ID}`;

function privateKey(): PrivateKey {
  const { privateKey: key } = generateKeyPairSync('ed25519');

  return new PrivateKey(
    key.export({ format: 'pem', type: 'pkcs8' }).toString(),
  );
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function remotePublicRelayRecord(): PublicRelayRecordPrimitives {
  return {
    expiresAt: Date.now() + 60_000,
    issuedAt: Date.now(),
    multiaddrs: [REMOTE_MULTIADDR, `${REMOTE_MULTIADDR}/p2p-circuit`],
    peerId: REMOTE_PEER_ID,
    publicKey: 'public-key',
    role: 'relay',
    signature: 'signature',
    version: 1,
  };
}

function networkSecrets(network: IPFSNetwork): string[] {
  const lookupKey = PrivateNetworkRelayRecordCodec.lookupKey(network);

  return [
    NETWORK_ID,
    PrivateNetworkRelayRecordCodec.fingerprint(network),
    lookupKey,
    Buffer.from(lookupKey).toString('base64url'),
  ];
}

/**
 * Network ids, network names, pubsub topics and network-key fingerprints link
 * a node to the private networks it serves, and remote peer ids and addresses
 * expose who it talks to. Diagnostics keep only the node's own configuration,
 * its own peer id and fixed labels.
 */
describe('Network log privacy with the real logger', () => {
  let captured: Array<{ level: string; message: unknown }>;
  let directory: string;
  let localDatabase: EmbeddedLocalDatabase;
  let previous: Record<string, string | undefined>;
  const environmentKeys = [
    'IPFS_STORAGE_PATH',
    'LOG_LEVEL',
    'LOG_URL',
    'PIGEON_LOCAL_DB_PATH',
    'SERVICE_NAME',
  ];

  function expectNotLogged(values: string[]): void {
    const text = JSON.stringify(captured);

    expect(captured.length).toBeGreaterThan(0);
    for (const value of values) {
      expect(text).not.toContain(value);
    }
  }

  function createPrivateNetwork(connection: IPFSConnection): IPFSNetwork {
    return new IPFSNetwork(
      new IPFSNetworkConfig(NETWORK_ID, 'private', privateKey()),
      connection,
    );
  }

  function createRelayDirectory(
    publicConnection: IPFSConnection,
  ): PrivateNetworkRelayRecordDirectory {
    jest
      .spyOn(PublicIPFS, 'createRoutingConnection')
      .mockResolvedValue(publicConnection);
    jest
      .spyOn(libp2pKeyAdapter, 'peerIdFromPrivateKey')
      .mockReturnValue('12D3KooWLocalShared');

    return new PrivateNetworkRelayRecordDirectory(
      localDatabase,
      new PrivateNetworkRelayDirectorySettings(),
    );
  }

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pigeon-network-log-'));
    previous = Object.fromEntries(
      environmentKeys.map((key) => [key, process.env[key]]),
    );
    Object.assign(process.env, {
      IPFS_STORAGE_PATH: directory,
      LOG_LEVEL: 'debug',
      LOG_URL: '.',
      PIGEON_LOCAL_DB_PATH: directory,
      SERVICE_NAME: 'network-privacy',
    });
    captured = [];
    jest.spyOn(Kernel, 'rootDirectory', 'get').mockReturnValue(directory);
    jest
      .spyOn(winston.transports.Console.prototype, 'log')
      .mockImplementation((info, callback) => {
        captured.push(info as { level: string; message: unknown });

        if (typeof callback === 'function') callback();
      });
    jest.spyOn(Kernel, 'logger', 'get').mockReturnValue(new WinstonLogger());
    localDatabase = new EmbeddedLocalDatabase();
  });

  afterEach(async () => {
    await localDatabase.close();
    for (const key of environmentKeys) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
    await fs.rm(directory, { force: true, recursive: true });
    new PublicRelayRecordRegistry().clear();
    jest.restoreAllMocks();
  });

  it('does not log the network, its topics or the remote relay while a cached relay keeps failing', async () => {
    const privateConnection = mock<IPFSConnection>();
    const publicConnection = mock<IPFSConnection>();
    const network = createPrivateNetwork(privateConnection);
    const relayDirectory = createRelayDirectory(publicConnection);

    privateConnection.getPeerId.mockReturnValue('12D3KooWLocalLeaf');
    privateConnection.getPeers.mockReturnValue([]);
    privateConnection.getMultiaddrs.mockReturnValue([]);
    privateConnection.dial.mockRejectedValue(
      new Error(`dial ${REMOTE_MULTIADDR} failed`),
    );
    publicConnection.getPeers.mockReturnValue([]);
    publicConnection.subscribePubSub.mockResolvedValue(undefined);
    publicConnection.waitForPeers.mockResolvedValue(false);
    await localDatabase.save(
      PrivateNetworkRelayRecordDirectory.relayRecordCacheNamespace,
      NETWORK_ID,
      {
        _id: NETWORK_ID,
        cachedAt: Date.now(),
        envelope: PrivateNetworkRelayRecordCodec.seal(network, {
          expiresAt: Date.now() + 60_000,
          issuedAt: Date.now(),
          multiaddrs: [REMOTE_MULTIADDR],
          peerId: REMOTE_PEER_ID,
          role: 'relay',
          version: 1,
        }),
        networkId: NETWORK_ID,
      } satisfies PrivateRelayRecordCacheDocument,
    );

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await relayDirectory.discover(network, mock());
    }

    expectNotLogged([...networkSecrets(network), REMOTE_HOST, REMOTE_PEER_ID]);
  });

  it('does not log the network or its fingerprint when relay publication is rejected', async () => {
    const privateConnection = mock<IPFSConnection>();
    const publicConnection = mock<IPFSConnection>();
    const network = createPrivateNetwork(privateConnection);
    const relayDirectory = createRelayDirectory(publicConnection);

    privateConnection.getPeerId.mockReturnValue('12D3KooWLocalRelay');
    privateConnection.getPeers.mockReturnValue([]);
    publicConnection.getPeers.mockReturnValue([REMOTE_PEER_ID]);
    publicConnection.provideRecord.mockResolvedValue(false);
    publicConnection.publishPubSub.mockResolvedValue(undefined);
    publicConnection.subscribePubSub.mockResolvedValue(undefined);
    publicConnection.waitForPeers.mockResolvedValue(true);

    await relayDirectory.publish(
      network,
      {
        announceAddresses: [
          '/dns4/own-relay.example.com/tcp/4181/p2p/12D3KooWLocalRelay',
        ],
        listenAddresses: ['/ip4/0.0.0.0/tcp/4181'],
        relayDataLimitBytes: 67_108_864,
      },
      mock(),
    );

    expectNotLogged([...networkSecrets(network), REMOTE_PEER_ID]);
  });

  it('does not log the network when its replicated state registration degrades', async () => {
    const network = mock<IPFSNetwork>();
    const networkRegistry = mock<IPFSNetworkRegistry>();
    const replicatedStateRegistry = mock<OrbitDBReplicatedStateRegistry>();
    const stores = mock<OrbitDBPrivateNetworkStores>();

    network.getId.mockReturnValue(NETWORK_ID);
    network.getName.mockReturnValue(NETWORK_NAME);
    network.getPeerId.mockReturnValue('12D3KooWLocalPeer');
    network.getPeers.mockReturnValue([]);
    network.isPrivate.mockReturnValue(true);
    networkRegistry.getAll.mockReturnValue([network]);
    stores.getSynchronizationStores.mockReturnValue([]);
    stores.startSynchronization.mockResolvedValue(undefined);
    jest.spyOn(OrbitDBPrivateNetworkStores, 'open').mockResolvedValue(stores);
    replicatedStateRegistry.register.mockRejectedValue(
      new DOMException(
        'The operation was aborted due to timeout',
        'TimeoutError',
      ),
    );

    await new OrbitDBReplicatedStateRuntime(
      networkRegistry,
      replicatedStateRegistry,
      mock<NodeNetworkSynchronizationMonitor>(),
    ).run();

    expectNotLogged([NETWORK_ID, NETWORK_NAME]);
  });

  it('does not log the network when a replicated head cache reconciliation fails', async () => {
    const events = new EventEmitter();
    let failing = false;
    const heads = mock<OrbitDBDatabase>({
      all: () =>
        failing
          ? Promise.reject(new Error(`head cache ${NETWORK_ID} unavailable`))
          : Promise.resolve([]),
      events,
    });
    const registry = new OrbitDBReplicatedStateRegistry();

    await registry.register(
      NETWORK_ID,
      mock<OrbitDBPrivateNetworkStores>({ heads }),
    );
    failing = true;
    events.emit('join', REMOTE_PEER_ID, [{ hash: 'remote-head' }]);
    await flushPromises();
    await flushPromises();

    expect(captured).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('OrbitDB head reconciliation failed'),
      }),
    );
    expectNotLogged([NETWORK_ID, REMOTE_PEER_ID]);
  });

  it('does not log a remote public relay peer or its address when dialing it fails', async () => {
    const registry = new PublicRelayRecordRegistry();
    const signer = mock<PublicRelayRecordSigner>();
    const node = mock<Libp2pPubSubNode>();

    signer.verify.mockResolvedValue(true);

    node.dial.mockRejectedValue(new Error(`dial ${REMOTE_HOST}`));
    registry.save(remotePublicRelayRecord());

    await new PublicRelayRecordDiscovery(registry, signer).connectKnown(node);

    expectNotLogged([REMOTE_HOST, REMOTE_PEER_ID]);
  });

  it('does not log the private network name or remote relays it dials', async () => {
    const dial = jest
      .fn()
      .mockRejectedValueOnce(new Error(`dial ${REMOTE_HOST}`))
      .mockResolvedValue(undefined);
    const heliaCore = mock<HeliaInstance>();

    Object.assign(heliaCore.libp2p, {
      dial,
      peerId: { toString: (): string => '12D3KooWLocalPrivate' },
    });
    new PublicRelayRecordRegistry().save(remotePublicRelayRecord());
    jest.spyOn(HeliaIPFSParser, 'parseOptions').mockResolvedValue(mock());
    jest
      .spyOn(HeliaIPFSParser, 'parsePrivateLibp2pConfig')
      .mockResolvedValue(mock());
    jest.spyOn(heliaRuntimeAdapter, 'createLibp2p').mockResolvedValue(mock());
    jest
      .spyOn(heliaRuntimeAdapter, 'createPrivateHelia')
      .mockResolvedValue(heliaCore);
    jest
      .spyOn(heliaRuntimeAdapter, 'createMultiaddr')
      .mockImplementation((address) =>
        Promise.resolve(mock<Multiaddr>({ toString: () => address })),
      );

    await HeliaIPFS.createPrivateHeliaCore(
      { publicRelayDiscoveryEnabled: true, storageLocation: 'memory' },
      privateKey(),
      NETWORK_NAME,
    );

    expect(dial).toHaveBeenCalled();
    expectNotLogged([NETWORK_NAME, REMOTE_HOST, REMOTE_PEER_ID]);
  });

  it('does not log a remote peer when a peer connection listener fails', async () => {
    const addEventListener = jest.fn<void, [string, (event: Event) => void]>();
    const heliaCore = mock<HeliaInstance>();

    Object.assign(heliaCore.libp2p, { addEventListener });
    const ipfs = new (class extends HeliaIPFS {})(heliaCore, {
      storageLocation: 'memory',
    });
    const event = new CustomEvent('peer', {
      detail: { remotePeer: REMOTE_PEER_ID },
    });

    ipfs.onPeerConnected(() => Promise.reject(new Error(REMOTE_PEER_ID)));
    ipfs.onPeerDisconnected(() => Promise.reject(new Error(REMOTE_PEER_ID)));
    for (const [name, listener] of addEventListener.mock.calls) {
      if (name === 'peer:connect' || name === 'peer:disconnect') {
        listener(event);
      }
    }
    await flushPromises();

    expectNotLogged([REMOTE_PEER_ID]);
  });
});
