import { IPFSConnection } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSConnection';
import {
  libp2pKeyAdapter,
  Libp2pPrivateKeyLike,
} from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { IPFSNetworkConfig } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import { PublicIPFS } from '@app/contexts/shared/infrastructure/ipfs/networks/PublicIPFS';
import Kernel from '@haskou/ddd-kernel';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import WinstonLogger from '@app/shared/infrastructure/logs/WinstonLogger';
import { PrivateNetworkRelayRecord } from '@app/shared/infrastructure/network/relay/PrivateNetworkRelayRecord';
import PrivateNetworkRelayRecordCodec from '@app/shared/infrastructure/network/relay/PrivateNetworkRelayRecordCodec';
import PrivateNetworkRelayRecordDirectory from '@app/shared/infrastructure/network/relay/PrivateNetworkRelayRecordDirectory';
import PrivateNetworkRelayDirectorySettings from '@app/shared/infrastructure/network/relay/PrivateNetworkRelayDirectorySettings';
import { PrivateRelayRecordCacheDocument } from '@app/shared/infrastructure/network/relay/PrivateRelayRecordCacheDocument';
import { PrivateKey } from '@haskou/value-objects';
import { generateKeyPairSync } from 'crypto';
import * as fs from 'fs/promises';
import { mock, MockProxy } from 'jest-mock-extended';
import os from 'os';
import path from 'path';

function privateKey(): PrivateKey {
  const { privateKey: key } = generateKeyPairSync('ed25519');

  return new PrivateKey(
    key.export({ format: 'pem', type: 'pkcs8' }).toString(),
  );
}

function privateNetwork(
  networkKey: PrivateKey,
  connection: MockProxy<IPFSConnection> = mock<IPFSConnection>(),
  peerId: string = '12D3KooWRelay',
): IPFSNetwork {
  connection.getPeerId.mockReturnValue(peerId);

  return new IPFSNetwork(
    new IPFSNetworkConfig('network-1', 'private', networkKey),
    connection,
  );
}

describe('PrivateNetworkRelayRecordDirectory', () => {
  let localDatabase: EmbeddedLocalDatabase;
  let localDatabasePath: string;
  let logger: MockProxy<WinstonLogger>;
  let previousIPFSStoragePath: string | undefined;
  let previousLocalDatabasePath: string | undefined;

  beforeEach(async () => {
    delete process.env.PIGEON_PRIVATE_RELAY_RECORD_GENERIC_DHT_ENABLED;
    delete process.env.PIGEON_PRIVATE_RELAY_RECORD_PUBSUB_ENABLED;
    delete process.env.PIGEON_PRIVATE_RELAY_CONNECTION_GRACE_MS;
    delete process.env.PIGEON_RELAY_RECORD_CONNECTED_DISCOVERY_INTERVAL_MS;
    delete process.env.PIGEON_PRIVATE_RELAY_CONNECTED_DISCOVERY_INTERVAL_MS;
    delete process.env.PIGEON_RELAY_RECORD_PUBLICATION_INTERVAL_MS;
    delete process.env.PIGEON_RELAY_RECORD_TTL_MS;
    delete process.env.PIGEON_PRIVATE_RELAY_RECORD_REFRESH_SECONDS;
    previousLocalDatabasePath = process.env.PIGEON_LOCAL_DB_PATH;
    previousIPFSStoragePath = process.env.IPFS_STORAGE_PATH;
    localDatabasePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'pigeon-relay-cache-'),
    );
    process.env.PIGEON_LOCAL_DB_PATH = localDatabasePath;
    process.env.IPFS_STORAGE_PATH = localDatabasePath;
    localDatabase = new EmbeddedLocalDatabase();

    logger = mock<WinstonLogger>();
    jest.spyOn(Kernel, 'logger', 'get').mockReturnValue(logger);
  });

  afterEach(async () => {
    await localDatabase.close();

    if (previousLocalDatabasePath === undefined) {
      delete process.env.PIGEON_LOCAL_DB_PATH;
    } else {
      process.env.PIGEON_LOCAL_DB_PATH = previousLocalDatabasePath;
    }

    if (previousIPFSStoragePath === undefined) {
      delete process.env.IPFS_STORAGE_PATH;
    } else {
      process.env.IPFS_STORAGE_PATH = previousIPFSStoragePath;
    }

    await fs.rm(localDatabasePath, { force: true, recursive: true });
    jest.restoreAllMocks();
  });

  it('should publish relay records through gossipsub without querying the DHT', async () => {
    const directory = createDirectory(localDatabase);
    const publicConnection = mock<IPFSConnection>();

    publicConnection.getPeers.mockReturnValue(['12D3KooWPublicPeer']);
    publicConnection.waitForPeers.mockResolvedValue(true);
    publicConnection.publishPubSub.mockResolvedValue(undefined);
    (
      directory as unknown as {
        getPublicConnection: () => Promise<IPFSConnection>;
      }
    ).getPublicConnection = jest.fn().mockResolvedValue(publicConnection);
    await directory.publish(
      privateNetwork(privateKey()),
      {
        announceAddresses: [
          '/dns4/relay.example.com/tcp/4181/p2p/12D3KooWRelay',
        ],
        listenAddresses: ['/ip4/0.0.0.0/tcp/4181'],
        relayDataLimitBytes: 67_108_864,
      },
      mock(),
    );

    expect(publicConnection.publishPubSub).toHaveBeenCalled();
    expect(publicConnection.putRecord).not.toHaveBeenCalled();
    expect(publicConnection.publishIPNSRecord).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('Private IPFS relay record publication failed'),
    );
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('reason="No publication channel succeeded."'),
    );
  });

  it('should stop answering relay record requests after publication stops', async () => {
    const directory = createDirectory(localDatabase);
    const publicConnection = mock<IPFSConnection>();
    const network = privateNetwork(privateKey());
    let requestHandler: ((payload: string) => Promise<void>) | undefined;

    publicConnection.getPeers.mockReturnValue(['12D3KooWPublicPeer']);
    publicConnection.waitForPeers.mockResolvedValue(true);
    publicConnection.publishPubSub.mockResolvedValue(undefined);
    publicConnection.subscribePubSub.mockImplementation(async (topic, handler) => {
      if (topic.endsWith('.request')) {
        requestHandler = handler;
      }
    });
    (
      directory as unknown as {
        getPublicConnection: () => Promise<IPFSConnection>;
      }
    ).getPublicConnection = jest.fn().mockResolvedValue(publicConnection);

    await directory.publish(
      network,
      {
        announceAddresses: [
          '/dns4/relay.example.com/tcp/4181/p2p/12D3KooWRelay',
        ],
        listenAddresses: ['/ip4/0.0.0.0/tcp/4181'],
        relayDataLimitBytes: 67_108_864,
      },
      mock(),
    );

    expect(requestHandler).toBeDefined();
    directory.stop(network.getId());
    await requestHandler?.('');

    expect(publicConnection.publishPubSub).toHaveBeenCalledTimes(1);
  });

  it('should not publish or discover relay records when disabled by options', () => {
    const directory = createDirectory(localDatabase);
    const publish = jest.spyOn(directory, 'publish').mockResolvedValue(false);
    const discover = jest.spyOn(directory, 'discover').mockResolvedValue();

    directory.start(
      privateNetwork(privateKey()),
      {
        announceAddresses: [
          '/dns4/relay.example.com/tcp/4181/p2p/12D3KooWRelay',
        ],
        listenAddresses: ['/ip4/0.0.0.0/tcp/4181'],
        relayDataLimitBytes: 67_108_864,
      },
      mock(),
      {
        discoveryEnabled: false,
        publicationEnabled: false,
      },
    );

    expect(publish).not.toHaveBeenCalled();
    expect(discover).not.toHaveBeenCalled();
  });

  it('should retry initial relay record discovery while pubsub peers join', async () => {
    jest.useFakeTimers();
    const directory = createDirectory(localDatabase);
    const network = privateNetwork(privateKey());
    const discover = jest.spyOn(directory, 'discover').mockResolvedValue();

    try {
      directory.start(network, undefined, mock(), {
        discoveryEnabled: true,
        publicationEnabled: false,
      });
      await flushPromises();

      expect(discover).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(1_000);
      await flushPromises();

      expect(discover).toHaveBeenCalledTimes(2);

      jest.advanceTimersByTime(5_000);
      await flushPromises();

      expect(discover).toHaveBeenCalledTimes(3);
    } finally {
      directory.stop(network.getId());
      jest.useRealTimers();
    }
  });

  it('should stop scheduled initial discovery retries with the network', async () => {
    jest.useFakeTimers();
    const directory = createDirectory(localDatabase);
    const network = privateNetwork(privateKey());
    const discover = jest.spyOn(directory, 'discover').mockResolvedValue();

    try {
      directory.start(network, undefined, mock(), {
        discoveryEnabled: true,
        publicationEnabled: false,
      });
      await flushPromises();

      directory.stop(network.getId());
      jest.advanceTimersByTime(21_000);
      await flushPromises();

      expect(discover).toHaveBeenCalledTimes(1);
    } finally {
      directory.stop(network.getId());
      jest.useRealTimers();
    }
  });

  it('should retry failed startup relay record publications before the hourly refresh', async () => {
    jest.useFakeTimers();
    const directory = createDirectory(localDatabase);
    const publicConnection = mock<IPFSConnection>();
    const network = privateNetwork(privateKey());

    try {
      publicConnection.getPeers.mockReturnValue([]);
      publicConnection.waitForPeers.mockResolvedValueOnce(false);
      publicConnection.publishPubSub.mockResolvedValue(undefined);
      publicConnection.putRecord.mockResolvedValue(undefined);
      (
        directory as unknown as {
          getPublicConnection: () => Promise<IPFSConnection>;
        }
      ).getPublicConnection = jest.fn().mockResolvedValue(publicConnection);
      (
        directory as unknown as {
          publishRelayIPNSRecord: () => Promise<boolean>;
        }
      ).publishRelayIPNSRecord = jest.fn().mockResolvedValue(false);

      directory.start(
        network,
        {
          announceAddresses: [
            '/dns4/relay.example.com/tcp/4181/p2p/12D3KooWRelay',
          ],
          listenAddresses: ['/ip4/0.0.0.0/tcp/4181'],
          relayDataLimitBytes: 67_108_864,
        },
        mock(),
        {
          discoveryEnabled: false,
          publicationEnabled: true,
        },
      );
      await flushPromises();

      expect(publicConnection.waitForPeers).toHaveBeenCalledTimes(1);
      expect(publicConnection.publishPubSub).not.toHaveBeenCalled();

      publicConnection.getPeers.mockReturnValue(['12D3KooWPublicPeer']);
      publicConnection.waitForPeers.mockResolvedValue(true);
      jest.advanceTimersByTime(15_000);
      await flushPromises();

      expect(publicConnection.waitForPeers).toHaveBeenCalledTimes(2);
      expect(publicConnection.publishPubSub).toHaveBeenCalled();
    } finally {
      directory.stop(network.getId());
      jest.useRealTimers();
    }
  });

  it('should not retry stopped relay record publications after an in-flight failure', async () => {
    jest.useFakeTimers();
    const directory = createDirectory(localDatabase);
    const publicConnection = mock<IPFSConnection>();
    const network = privateNetwork(privateKey());
    let finishPeerWait: (result: boolean) => void = () => undefined;
    const pendingPeerWait = new Promise<boolean>((resolve) => {
      finishPeerWait = resolve;
    });

    try {
      publicConnection.getPeers.mockReturnValue([]);
      publicConnection.waitForPeers.mockReturnValue(pendingPeerWait);
      publicConnection.publishPubSub.mockResolvedValue(undefined);
      publicConnection.putRecord.mockResolvedValue(undefined);
      (
        directory as unknown as {
          getPublicConnection: () => Promise<IPFSConnection>;
        }
      ).getPublicConnection = jest.fn().mockResolvedValue(publicConnection);
      (
        directory as unknown as {
          publishRelayIPNSRecord: () => Promise<boolean>;
        }
      ).publishRelayIPNSRecord = jest.fn().mockResolvedValue(false);

      directory.start(
        network,
        {
          announceAddresses: [
            '/dns4/relay.example.com/tcp/4181/p2p/12D3KooWRelay',
          ],
          listenAddresses: ['/ip4/0.0.0.0/tcp/4181'],
          relayDataLimitBytes: 67_108_864,
        },
        mock(),
        {
          discoveryEnabled: false,
          publicationEnabled: true,
        },
      );
      await flushPromises();

      directory.stop(network.getId());
      finishPeerWait(false);
      await flushPromises();

      jest.advanceTimersByTime(15_000);
      await flushPromises();

      expect(publicConnection.waitForPeers).toHaveBeenCalledTimes(1);
      expect(publicConnection.publishPubSub).not.toHaveBeenCalled();
    } finally {
      directory.stop(network.getId());
      jest.useRealTimers();
    }
  });

  it('should dial a locally cached relay before waiting for public routing peers', async () => {
    const directory = createDirectory(localDatabase);
    const networkKey = privateKey();
    const privateConnection = mock<IPFSConnection>();
    const network = privateNetwork(
      networkKey,
      privateConnection,
      '12D3KooWLeaf',
    );
    const publicConnection = mock<IPFSConnection>();
    const relayRecord: PrivateNetworkRelayRecord = {
      expiresAt: Date.now() + 60_000,
      issuedAt: Date.now(),
      multiaddrs: ['/dns4/relay.example.com/tcp/4181/p2p/12D3KooWRelay'],
      peerId: '12D3KooWRelay',
      role: 'relay',
      version: 1,
    };
    const envelope = PrivateNetworkRelayRecordCodec.seal(network, relayRecord);

    privateConnection.getPeers.mockReturnValue([]);
    privateConnection.getMultiaddrs.mockReturnValue([]);
    publicConnection.subscribePubSub.mockResolvedValue(undefined);
    publicConnection.waitForPeers.mockResolvedValue(false);

    (
      directory as unknown as {
        getPublicConnection: () => Promise<IPFSConnection>;
      }
    ).getPublicConnection = jest.fn().mockResolvedValue(publicConnection);
    await localDatabase.save(
      PrivateNetworkRelayRecordDirectory.relayRecordCacheNamespace,
      network.getId(),
      {
        _id: network.getId(),
        cachedAt: Date.now(),
        envelope,
        networkId: network.getId(),
      } satisfies PrivateRelayRecordCacheDocument,
    );

    await directory.discover(network, mock());

    expect(privateConnection.dial).toHaveBeenCalledWith(
      relayRecord.multiaddrs[0],
      expect.any(AbortSignal),
    );
    expect(publicConnection.waitForPeers).not.toHaveBeenCalled();
  });

  it('should not rediscover a cached relay while it remains connected', async () => {
    const directory = createDirectory(localDatabase);
    const networkKey = privateKey();
    const privateConnection = mock<IPFSConnection>();
    const network = privateNetwork(
      networkKey,
      privateConnection,
      '12D3KooWLeaf',
    );
    const publicConnection = mock<IPFSConnection>();
    const relayMultiaddr = '/dns4/relay.example.com/tcp/4181/p2p/12D3KooWRelay';
    const relayRecord: PrivateNetworkRelayRecord = {
      expiresAt: Date.now() + 60_000,
      issuedAt: Date.now(),
      multiaddrs: [relayMultiaddr],
      peerId: '12D3KooWRelay',
      role: 'relay',
      version: 1,
    };
    const envelope = PrivateNetworkRelayRecordCodec.seal(network, relayRecord);
    const getPublicConnection = jest.fn().mockResolvedValue(publicConnection);

    privateConnection.getPeers
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValue(['12D3KooWRelay']);
    privateConnection.getMultiaddrs.mockReturnValue([
      `${relayMultiaddr}/p2p-circuit`,
    ]);
    privateConnection.dial.mockResolvedValue(undefined);
    publicConnection.subscribePubSub.mockResolvedValue(undefined);
    publicConnection.waitForPeers.mockResolvedValue(false);

    (
      directory as unknown as {
        getPublicConnection: () => Promise<IPFSConnection>;
      }
    ).getPublicConnection = getPublicConnection;
    await localDatabase.save(
      PrivateNetworkRelayRecordDirectory.relayRecordCacheNamespace,
      network.getId(),
      {
        _id: network.getId(),
        cachedAt: Date.now(),
        envelope,
        networkId: network.getId(),
      } satisfies PrivateRelayRecordCacheDocument,
    );

    const findOneSpy = jest.spyOn(localDatabase, 'findOne');

    await directory.discover(network, mock());

    expect(privateConnection.dial).toHaveBeenCalledWith(
      relayRecord.multiaddrs[0],
      expect.any(AbortSignal),
    );

    findOneSpy.mockClear();
    getPublicConnection.mockClear();
    privateConnection.dial.mockClear();

    await directory.discover(network, mock());

    expect(findOneSpy).not.toHaveBeenCalled();
    expect(getPublicConnection).not.toHaveBeenCalled();
    expect(privateConnection.dial).not.toHaveBeenCalled();
    expect(publicConnection.waitForPeers).not.toHaveBeenCalled();
  });

  it('should not rediscover a cached relay while the recent connection is settling', async () => {
    const directory = createDirectory(localDatabase);
    const networkKey = privateKey();
    const privateConnection = mock<IPFSConnection>();
    const network = privateNetwork(
      networkKey,
      privateConnection,
      '12D3KooWLeaf',
    );
    const publicConnection = mock<IPFSConnection>();
    const relayMultiaddr = '/dns4/relay.example.com/tcp/4181/p2p/12D3KooWRelay';
    const relayRecord: PrivateNetworkRelayRecord = {
      expiresAt: Date.now() + 60_000,
      issuedAt: Date.now(),
      multiaddrs: [relayMultiaddr],
      peerId: '12D3KooWRelay',
      role: 'relay',
      version: 1,
    };
    const envelope = PrivateNetworkRelayRecordCodec.seal(network, relayRecord);
    const getPublicConnection = jest.fn().mockResolvedValue(publicConnection);

    privateConnection.getPeers.mockReturnValue([]);
    privateConnection.getMultiaddrs.mockReturnValue([]);
    privateConnection.dial.mockResolvedValue(undefined);
    privateConnection.listen.mockResolvedValue(undefined);
    publicConnection.subscribePubSub.mockResolvedValue(undefined);
    publicConnection.waitForPeers.mockResolvedValue(false);

    (
      directory as unknown as {
        getPublicConnection: () => Promise<IPFSConnection>;
      }
    ).getPublicConnection = getPublicConnection;
    await localDatabase.save(
      PrivateNetworkRelayRecordDirectory.relayRecordCacheNamespace,
      network.getId(),
      {
        _id: network.getId(),
        cachedAt: Date.now(),
        envelope,
        networkId: network.getId(),
      } satisfies PrivateRelayRecordCacheDocument,
    );

    const findOneSpy = jest.spyOn(localDatabase, 'findOne');

    await directory.discover(network, mock());

    expect(privateConnection.dial).toHaveBeenCalledWith(
      relayRecord.multiaddrs[0],
      expect.any(AbortSignal),
    );
    expect(privateConnection.listen).toHaveBeenCalledWith(
      `${relayRecord.multiaddrs[0]}/p2p-circuit`,
    );

    findOneSpy.mockClear();
    getPublicConnection.mockClear();
    privateConnection.dial.mockClear();
    privateConnection.listen.mockClear();

    await directory.discover(network, mock());

    expect(findOneSpy).not.toHaveBeenCalled();
    expect(getPublicConnection).not.toHaveBeenCalled();
    expect(privateConnection.dial).not.toHaveBeenCalled();
    expect(privateConnection.listen).not.toHaveBeenCalled();
    expect(publicConnection.waitForPeers).not.toHaveBeenCalled();
  });

  it('should retry a cached relay after the recent connection grace expires without peer confirmation', async () => {
    process.env.PIGEON_PRIVATE_RELAY_CONNECTION_GRACE_MS = '1';
    const now = 1_000_000;
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(now);
    const directory = createDirectory(localDatabase);
    const networkKey = privateKey();
    const privateConnection = mock<IPFSConnection>();
    const network = privateNetwork(
      networkKey,
      privateConnection,
      '12D3KooWLeaf',
    );
    const publicConnection = mock<IPFSConnection>();
    const relayMultiaddr = '/dns4/relay.example.com/tcp/4181/p2p/12D3KooWRelay';
    const relayRecord: PrivateNetworkRelayRecord = {
      expiresAt: now + 60_000,
      issuedAt: now,
      multiaddrs: [relayMultiaddr],
      peerId: '12D3KooWRelay',
      role: 'relay',
      version: 1,
    };
    const envelope = PrivateNetworkRelayRecordCodec.seal(network, relayRecord);
    const getPublicConnection = jest.fn().mockResolvedValue(publicConnection);

    privateConnection.getPeers.mockReturnValue([]);
    privateConnection.getMultiaddrs.mockReturnValue([]);
    privateConnection.dial.mockResolvedValue(undefined);
    privateConnection.listen.mockResolvedValue(undefined);
    publicConnection.subscribePubSub.mockResolvedValue(undefined);
    publicConnection.waitForPeers.mockResolvedValue(false);

    (
      directory as unknown as {
        getPublicConnection: () => Promise<IPFSConnection>;
      }
    ).getPublicConnection = getPublicConnection;
    await localDatabase.save(
      PrivateNetworkRelayRecordDirectory.relayRecordCacheNamespace,
      network.getId(),
      {
        _id: network.getId(),
        cachedAt: now,
        envelope,
        networkId: network.getId(),
      } satisfies PrivateRelayRecordCacheDocument,
    );

    const findOneSpy = jest.spyOn(localDatabase, 'findOne');

    await directory.discover(network, mock());

    findOneSpy.mockClear();
    getPublicConnection.mockClear();
    privateConnection.dial.mockClear();
    privateConnection.listen.mockClear();
    dateNowSpy.mockReturnValue(now + 2);

    await directory.discover(network, mock());

    expect(findOneSpy).toHaveBeenCalledWith(
      PrivateNetworkRelayRecordDirectory.relayRecordCacheNamespace,
      network.getId(),
    );
    expect(getPublicConnection).toHaveBeenCalled();
    expect(privateConnection.dial).toHaveBeenCalledWith(
      relayRecord.multiaddrs[0],
      expect.any(AbortSignal),
    );
    expect(privateConnection.listen).toHaveBeenCalledWith(
      `${relayRecord.multiaddrs[0]}/p2p-circuit`,
    );
  });

  it('should invalidate a locally cached relay after repeated failed dials', async () => {
    const directory = createDirectory(localDatabase);
    const networkKey = privateKey();
    const privateConnection = mock<IPFSConnection>();
    const network = privateNetwork(
      networkKey,
      privateConnection,
      '12D3KooWLeaf',
    );
    const publicConnection = mock<IPFSConnection>();
    const relayMultiaddr = '/dns4/relay.example.com/tcp/4181/p2p/12D3KooWRelay';
    const relayRecord: PrivateNetworkRelayRecord = {
      expiresAt: Date.now() + 60_000,
      issuedAt: Date.now(),
      multiaddrs: [relayMultiaddr],
      peerId: '12D3KooWRelay',
      role: 'relay',
      version: 1,
    };
    const envelope = PrivateNetworkRelayRecordCodec.seal(network, relayRecord);

    privateConnection.getPeers.mockReturnValue([]);
    privateConnection.getMultiaddrs.mockReturnValue([]);
    privateConnection.dial.mockRejectedValue(new Error('dial failed'));
    publicConnection.subscribePubSub.mockResolvedValue(undefined);
    publicConnection.getPeers.mockReturnValue([]);
    publicConnection.waitForPeers.mockResolvedValue(false);

    (
      directory as unknown as {
        getPublicConnection: () => Promise<IPFSConnection>;
      }
    ).getPublicConnection = jest.fn().mockResolvedValue(publicConnection);
    await localDatabase.save(
      PrivateNetworkRelayRecordDirectory.relayRecordCacheNamespace,
      network.getId(),
      {
        _id: network.getId(),
        cachedAt: Date.now(),
        envelope,
        networkId: network.getId(),
      } satisfies PrivateRelayRecordCacheDocument,
    );

    await directory.discover(network, mock());
    await directory.discover(network, mock());
    await directory.discover(network, mock());

    expect(privateConnection.dial).toHaveBeenCalledTimes(3);
    await expect(
      localDatabase.findOne(
        PrivateNetworkRelayRecordDirectory.relayRecordCacheNamespace,
        network.getId(),
      ),
    ).resolves.toBeUndefined();

    privateConnection.dial.mockClear();

    await directory.discover(network, mock());

    expect(privateConnection.dial).not.toHaveBeenCalled();
  });

  it('should reuse the configured public connection for the same relay configuration', async () => {
    const directory = createDirectory(localDatabase);
    const publicConnection = mock<IPFSConnection>();
    const sharedPrivateKey = {} as Libp2pPrivateKeyLike;
    const createPublicConnection = jest
      .spyOn(PublicIPFS, 'create')
      .mockResolvedValue(publicConnection);
    const options = {
      enableRelayServer: true,
      listenAddresses: ['/ip4/0.0.0.0/tcp/4011'],
      relayDataLimitBytes: 67_108_864,
      sharedPrivateKey,
    };

    publicConnection.subscribePubSub.mockResolvedValue(undefined);
    jest
      .spyOn(libp2pKeyAdapter, 'peerIdFromPrivateKey')
      .mockReturnValue('peer-local');

    const firstConnection = await directory.configurePublicConnection(options);
    const secondConnection =
      await directory.configurePublicConnection(options);

    expect(firstConnection).toBe(publicConnection);
    expect(secondConnection).toBe(publicConnection);
    expect(createPublicConnection).toHaveBeenCalledTimes(1);
    expect(publicConnection.stop).not.toHaveBeenCalled();
  });
});

function flushPromises(): Promise<void> {
  return Promise.resolve()
    .then(() => Promise.resolve())
    .then(() => Promise.resolve());
}

function createDirectory(
  localDatabase: EmbeddedLocalDatabase,
): PrivateNetworkRelayRecordDirectory {
  return new PrivateNetworkRelayRecordDirectory(
    localDatabase,
    new PrivateNetworkRelayDirectorySettings(),
  );
}
