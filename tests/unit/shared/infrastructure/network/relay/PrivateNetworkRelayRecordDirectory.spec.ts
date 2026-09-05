import { IPFSConnection } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSConnection';
import {
  libp2pKeyAdapter,
  Libp2pPrivateKeyLike,
} from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { IPFSNetworkConfig } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import { PublicIPFS } from '@app/contexts/shared/infrastructure/ipfs/networks/PublicIPFS';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import WinstonLogger from '@app/shared/infrastructure/logs/WinstonLogger';
import PrivateNetworkRelayDirectorySettings from '@app/shared/infrastructure/network/relay/PrivateNetworkRelayDirectorySettings';
import { PrivateNetworkRelayRecord } from '@app/shared/infrastructure/network/relay/PrivateNetworkRelayRecord';
import PrivateNetworkRelayRecordCodec from '@app/shared/infrastructure/network/relay/PrivateNetworkRelayRecordCodec';
import PrivateNetworkRelayRecordDirectory from '@app/shared/infrastructure/network/relay/PrivateNetworkRelayRecordDirectory';
import { PrivateRelayRecordCacheDocument } from '@app/shared/infrastructure/network/relay/PrivateRelayRecordCacheDocument';
import Kernel from '@haskou/ddd-kernel';
import { PrivateKey } from '@haskou/pigeon-swarm-crypto';
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

  it('should publish relay records through gossipsub and announce their providers', async () => {
    const directory = createDirectory(localDatabase);
    const publicConnection = mock<IPFSConnection>();

    publicConnection.getPeers.mockReturnValue(['12D3KooWPublicPeer']);
    publicConnection.waitForPeers.mockResolvedValue(true);
    publicConnection.publishPubSub.mockResolvedValue(undefined);
    publicConnection.provideRecord.mockResolvedValue(true);
    (
      directory as unknown as {
        getPublicConnection: () => Promise<IPFSConnection>;
      }
    ).getPublicConnection = jest.fn().mockResolvedValue(publicConnection);
    const network = privateNetwork(privateKey());

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

    expect(publicConnection.publishPubSub).toHaveBeenCalled();
    expect(publicConnection.provideRecord).toHaveBeenCalledWith(
      PrivateNetworkRelayRecordCodec.lookupKey(network),
    );
    expect(publicConnection.putRecord).not.toHaveBeenCalled();
    expect(publicConnection.publishIPNSRecord).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('Private IPFS relay record publication failed'),
    );
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('reason="No publication channel succeeded."'),
    );
  });

  it('should fail publication when the relay provider announcement fails', async () => {
    const directory = createDirectory(localDatabase);
    const publicConnection = mock<IPFSConnection>();
    const network = privateNetwork(privateKey());

    publicConnection.getPeers.mockReturnValue(['12D3KooWPublicPeer']);
    publicConnection.provideRecord.mockResolvedValue(false);
    publicConnection.publishPubSub.mockResolvedValue(undefined);
    publicConnection.waitForPeers.mockResolvedValue(true);
    (
      directory as unknown as {
        getPublicConnection: () => Promise<IPFSConnection>;
      }
    ).getPublicConnection = jest.fn().mockResolvedValue(publicConnection);

    await expect(
      directory.publish(
        network,
        {
          announceAddresses: [
            '/dns4/relay.example.com/tcp/4181/p2p/12D3KooWRelay',
          ],
          listenAddresses: ['/ip4/0.0.0.0/tcp/4181'],
          relayDataLimitBytes: 67_108_864,
        },
        mock(),
      ),
    ).resolves.toBe(false);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('The DHT provider announcement failed.'),
    );
  });

  it('should stop answering relay record requests after publication stops', async () => {
    const directory = createDirectory(localDatabase);
    const publicConnection = mock<IPFSConnection>();
    const network = privateNetwork(privateKey());
    let requestHandler: ((payload: string) => Promise<void>) | undefined;

    publicConnection.getPeers.mockReturnValue(['12D3KooWPublicPeer']);
    publicConnection.provideRecord.mockResolvedValue(true);
    publicConnection.waitForPeers.mockResolvedValue(true);
    publicConnection.publishPubSub.mockResolvedValue(undefined);
    publicConnection.subscribePubSub.mockImplementation((topic, handler) => {
      if (topic.endsWith('.request')) {
        requestHandler = handler;
      }

      return Promise.resolve();
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

  it('should not reschedule a discovery retry that settles after stop', async () => {
    jest.useFakeTimers();
    const directory = createDirectory(localDatabase);
    const network = privateNetwork(privateKey());
    let finishRetry!: () => void;
    const retry = new Promise<void>((resolve) => {
      finishRetry = resolve;
    });
    const discover = jest
      .spyOn(directory, 'discover')
      .mockResolvedValue()
      .mockResolvedValueOnce()
      .mockReturnValueOnce(retry);

    try {
      directory.start(network, undefined, mock(), {
        discoveryEnabled: true,
        publicationEnabled: false,
      });
      await flushPromises();
      jest.advanceTimersByTime(1_000);
      expect(discover).toHaveBeenCalledTimes(2);
      directory.stop(network.getId());
      finishRetry();
      await flushPromises();
      jest.advanceTimersByTime(5_000);
      await flushPromises();
      expect(discover).toHaveBeenCalledTimes(2);
    } finally {
      directory.stop(network.getId());
      finishRetry();
      jest.useRealTimers();
    }
  });

  it('should not let a previous lifecycle restart retries while a new retry is pending', async () => {
    jest.useFakeTimers();
    const directory = createDirectory(localDatabase);
    const network = privateNetwork(privateKey());
    let finishOldRetry!: () => void;
    let finishNewRetry!: () => void;
    const oldRetry = new Promise<void>((resolve) => {
      finishOldRetry = resolve;
    });
    const newRetry = new Promise<void>((resolve) => {
      finishNewRetry = resolve;
    });
    const discover = jest
      .spyOn(directory, 'discover')
      .mockResolvedValue()
      .mockResolvedValueOnce()
      .mockReturnValueOnce(oldRetry)
      .mockResolvedValueOnce()
      .mockReturnValueOnce(newRetry);

    try {
      directory.start(network, undefined, mock(), {
        discoveryEnabled: true,
        publicationEnabled: false,
      });
      await flushPromises();
      jest.advanceTimersByTime(1_000);
      directory.stop(network.getId());
      directory.start(network, undefined, mock(), {
        discoveryEnabled: true,
        publicationEnabled: false,
      });
      await flushPromises();
      jest.advanceTimersByTime(1_000);
      expect(discover).toHaveBeenCalledTimes(4);
      finishOldRetry();
      await flushPromises();
      jest.advanceTimersByTime(2_000);
      await flushPromises();
      expect(discover).toHaveBeenCalledTimes(4);
      finishNewRetry();
      await flushPromises();
      jest.advanceTimersByTime(2_000);
      await flushPromises();
      expect(discover).toHaveBeenCalledTimes(5);
    } finally {
      directory.stop(network.getId());
      finishOldRetry();
      finishNewRetry();
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
      publicConnection.provideRecord.mockResolvedValue(true);
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

  it('should connect routed private relay providers through the private network', async () => {
    const directory = createDirectory(localDatabase);
    const privateConnection = mock<IPFSConnection>();
    const network = privateNetwork(
      privateKey(),
      privateConnection,
      '12D3KooWLeaf',
    );
    const publicConnection = mock<IPFSConnection>();
    const providerMultiaddr =
      '/dns4/relay.example.com/tcp/4181/p2p/12D3KooWRelay';

    privateConnection.getMultiaddrs.mockReturnValue([]);
    privateConnection.getPeers.mockReturnValue([]);
    privateConnection.listen.mockResolvedValue(undefined);
    publicConnection.dial.mockResolvedValue(undefined);
    publicConnection.findRecordProviderMultiaddrs.mockResolvedValue([
      providerMultiaddr,
    ]);
    publicConnection.getPeers.mockReturnValue(['12D3KooWPublicPeer']);
    publicConnection.publishPubSub.mockResolvedValue(undefined);
    publicConnection.subscribePubSub.mockResolvedValue(undefined);
    publicConnection.waitForPeers.mockResolvedValue(true);
    (
      directory as unknown as {
        getPublicConnection: () => Promise<IPFSConnection>;
      }
    ).getPublicConnection = jest.fn().mockResolvedValue(publicConnection);

    await directory.discover(network, mock());

    expect(publicConnection.findRecordProviderMultiaddrs).toHaveBeenCalledWith(
      PrivateNetworkRelayRecordCodec.lookupKey(network),
    );
    expect(privateConnection.dial).toHaveBeenCalledWith(
      providerMultiaddr,
      expect.any(AbortSignal),
    );
    expect(publicConnection.dial).not.toHaveBeenCalled();
    expect(publicConnection.publishPubSub).not.toHaveBeenCalled();
  });

  it('should keep one active circuit relay while it remains connected', async () => {
    const directory = createDirectory(localDatabase);
    const privateConnection = mock<IPFSConnection>();
    const network = privateNetwork(
      privateKey(),
      privateConnection,
      '12D3KooWLeaf',
    );
    const firstRelay: PrivateNetworkRelayRecord = {
      expiresAt: Date.now() + 60_000,
      issuedAt: Date.now(),
      multiaddrs: ['/dns4/relay-a.example.com/tcp/4181/p2p/12D3KooWRelayA'],
      peerId: '12D3KooWRelayA',
      role: 'relay',
      version: 1,
    };
    const secondRelay: PrivateNetworkRelayRecord = {
      expiresAt: Date.now() + 60_000,
      issuedAt: Date.now(),
      multiaddrs: ['/dns4/relay-b.example.com/tcp/4181/p2p/12D3KooWRelayB'],
      peerId: '12D3KooWRelayB',
      role: 'relay',
      version: 1,
    };
    let peers: string[] = [];
    let multiaddrs: string[] = [];

    privateConnection.getPeers.mockImplementation(() => peers);
    privateConnection.getMultiaddrs.mockImplementation(() => multiaddrs);
    privateConnection.dial.mockImplementation(async () => {
      peers = [firstRelay.peerId];
    });
    privateConnection.listen.mockImplementation(async (multiaddr) => {
      multiaddrs = [multiaddr];
    });
    const dialRelayRecord = (
      directory as unknown as {
        dialPrivateRelayRecord(
          currentNetwork: IPFSNetwork,
          relayRecord: PrivateNetworkRelayRecord,
        ): Promise<boolean>;
      }
    ).dialPrivateRelayRecord.bind(directory);

    await expect(dialRelayRecord(network, firstRelay)).resolves.toBe(true);
    await expect(dialRelayRecord(network, secondRelay)).resolves.toBe(false);

    expect(privateConnection.dial).toHaveBeenCalledTimes(1);
    expect(privateConnection.dial).toHaveBeenCalledWith(
      firstRelay.multiaddrs[0],
      expect.any(AbortSignal),
    );
    expect(privateConnection.listen).toHaveBeenCalledWith(
      `${firstRelay.multiaddrs[0]}/p2p-circuit`,
    );
  });

  it('should connect relay publishers directly without nested circuit reservations', async () => {
    const directory = createDirectory(localDatabase);
    const privateConnection = mock<IPFSConnection>();
    const publicConnection = mock<IPFSConnection>();
    const networkKey = privateKey();
    const network = privateNetwork(
      networkKey,
      privateConnection,
      '12D3KooWRelayA',
    );
    const remoteRelay: PrivateNetworkRelayRecord = {
      expiresAt: Date.now() + 60_000,
      issuedAt: Date.now(),
      multiaddrs: ['/dns4/relay-b.example.com/tcp/4181/p2p/12D3KooWRelayB'],
      peerId: '12D3KooWRelayB',
      role: 'relay',
      version: 1,
    };
    const subscriptions = new Map<string, (payload: string) => Promise<void>>();

    privateConnection.getPeers.mockReturnValue([]);
    privateConnection.dial.mockResolvedValue(undefined);
    publicConnection.dial.mockResolvedValue(undefined);
    publicConnection.findRecordProviderMultiaddrs.mockResolvedValue([
      '/dns4/public-provider.example.com/tcp/4001/p2p/12D3KooWPublicProvider',
    ]);
    publicConnection.getPeers.mockReturnValue(['12D3KooWPublicPeer']);
    publicConnection.provideRecord.mockResolvedValue(true);
    publicConnection.publishPubSub.mockResolvedValue(undefined);
    publicConnection.subscribePubSub.mockImplementation((topic, handler) => {
      subscriptions.set(topic, handler);

      return Promise.resolve();
    });
    publicConnection.waitForPeers.mockResolvedValue(true);
    (
      directory as unknown as {
        getPublicConnection(): Promise<IPFSConnection>;
      }
    ).getPublicConnection = jest.fn().mockResolvedValue(publicConnection);

    directory.start(
      network,
      {
        announceAddresses: [
          '/dns4/relay-a.example.com/tcp/4181/p2p/12D3KooWRelayA',
        ],
        listenAddresses: ['/ip4/0.0.0.0/tcp/4181'],
        relayDataLimitBytes: 67_108_864,
      },
      mock(),
      {
        discoveryEnabled: true,
        publicationEnabled: true,
      },
    );
    await flushPromises();
    await flushPromises();

    const relayRecordHandler = [...subscriptions.entries()].find(
      ([topic]) => !topic.endsWith('.request'),
    )?.[1];

    expect(relayRecordHandler).toBeDefined();
    await relayRecordHandler?.(
      JSON.stringify(PrivateNetworkRelayRecordCodec.seal(network, remoteRelay)),
    );

    expect(privateConnection.dial).toHaveBeenCalledWith(
      remoteRelay.multiaddrs[0],
      expect.any(AbortSignal),
    );
    expect(privateConnection.listen).not.toHaveBeenCalled();
    expect(publicConnection.dial).toHaveBeenCalledWith(
      expect.stringContaining('12D3KooWPublicProvider'),
      expect.any(AbortSignal),
    );
    directory.stop(network.getId());
  });

  it('should keep requesting unknown publishers while all known relays are connected', async () => {
    let now = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    process.env.PIGEON_RELAY_RECORD_CONNECTED_DISCOVERY_INTERVAL_MS = '10000';
    const directory = createDirectory(localDatabase);
    const privateConnection = mock<IPFSConnection>();
    const publicConnection = mock<IPFSConnection>();
    const network = privateNetwork(
      privateKey(),
      privateConnection,
      '12D3KooWRelayA',
    );
    const knownRelay: PrivateNetworkRelayRecord = {
      expiresAt: now + 600_000,
      issuedAt: now,
      multiaddrs: ['/dns4/relay-b.example.com/tcp/4181/p2p/12D3KooWRelayB'],
      peerId: '12D3KooWRelayB',
      role: 'relay',
      version: 1,
    };
    const subscriptions = new Map<string, (payload: string) => Promise<void>>();
    privateConnection.getPeers.mockReturnValue([knownRelay.peerId]);
    publicConnection.getPeers.mockReturnValue(['12D3KooWPublicPeer']);
    publicConnection.waitForPeers.mockResolvedValue(true);
    publicConnection.findRecordProviderMultiaddrs.mockResolvedValue([]);
    publicConnection.provideRecord.mockResolvedValue(true);
    publicConnection.publishPubSub.mockResolvedValue(undefined);
    publicConnection.subscribePubSub.mockImplementation(
      async (topic, handler) => {
        subscriptions.set(topic, handler);
      },
    );
    (
      directory as unknown as {
        getPublicConnection(): Promise<IPFSConnection>;
      }
    ).getPublicConnection = jest.fn().mockResolvedValue(publicConnection);

    try {
      directory.start(
        network,
        {
          announceAddresses: [
            '/dns4/relay-a.example.com/tcp/4181/p2p/12D3KooWRelayA',
          ],
          listenAddresses: ['/ip4/0.0.0.0/tcp/4181'],
          relayDataLimitBytes: 67_108_864,
        },
        mock(),
        { discoveryEnabled: true, publicationEnabled: true },
      );
      await flushPromises();
      await flushPromises();
      await directory.discover(network, mock());
      logger.info.mockClear();
      await directory.discover(network, mock());
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('privateConnected=false'),
      );
      const handler = [...subscriptions.entries()].find(
        ([topic]) => !topic.endsWith('.request'),
      )?.[1];
      expect(handler).toBeDefined();
      await handler?.(
        JSON.stringify(
          PrivateNetworkRelayRecordCodec.seal(network, knownRelay),
        ),
      );
      publicConnection.publishPubSub.mockClear();
      publicConnection.findRecordProviderMultiaddrs.mockClear();

      await directory.discover(network, mock());
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('privateConnected=true'),
      );
      expect(
        publicConnection.findRecordProviderMultiaddrs,
      ).toHaveBeenCalledTimes(1);
      expect(publicConnection.publishPubSub).toHaveBeenCalledWith(
        expect.stringMatching(/\.request$/),
        '',
      );
      await directory.discover(network, mock());
      expect(
        publicConnection.findRecordProviderMultiaddrs,
      ).toHaveBeenCalledTimes(1);

      now += 10_000;
      await directory.discover(network, mock());
      expect(
        publicConnection.findRecordProviderMultiaddrs,
      ).toHaveBeenCalledTimes(2);
      expect(privateConnection.dial).not.toHaveBeenCalled();
    } finally {
      directory.stop(network.getId());
      delete process.env.PIGEON_RELAY_RECORD_CONNECTED_DISCOVERY_INTERVAL_MS;
    }
  });

  it('should resume connected discovery throttling after a departed publisher expires', async () => {
    let now = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    process.env.PIGEON_RELAY_RECORD_CONNECTED_DISCOVERY_INTERVAL_MS = '10000';
    const directory = createDirectory(localDatabase);
    const privateConnection = mock<IPFSConnection>();
    const publicConnection = mock<IPFSConnection>();
    const network = privateNetwork(
      privateKey(),
      privateConnection,
      '12D3KooWRelayA',
    );
    const knownRelay: PrivateNetworkRelayRecord = {
      expiresAt: now + 600_000,
      issuedAt: now,
      multiaddrs: ['/dns4/relay-b.example.com/tcp/4181/p2p/12D3KooWRelayB'],
      peerId: '12D3KooWRelayB',
      role: 'relay',
      version: 1,
    };
    const subscriptions = new Map<string, (payload: string) => Promise<void>>();
    privateConnection.getPeers.mockReturnValue([knownRelay.peerId]);
    publicConnection.getPeers.mockReturnValue(['12D3KooWPublicPeer']);
    publicConnection.waitForPeers.mockResolvedValue(true);
    publicConnection.findRecordProviderMultiaddrs.mockResolvedValue([]);
    publicConnection.provideRecord.mockResolvedValue(true);
    publicConnection.publishPubSub.mockResolvedValue(undefined);
    publicConnection.subscribePubSub.mockImplementation(
      async (topic, handler) => {
        subscriptions.set(topic, handler);
      },
    );
    (
      directory as unknown as {
        getPublicConnection(): Promise<IPFSConnection>;
      }
    ).getPublicConnection = jest.fn().mockResolvedValue(publicConnection);

    try {
      directory.start(
        network,
        {
          announceAddresses: [
            '/dns4/relay-a.example.com/tcp/4181/p2p/12D3KooWRelayA',
          ],
          listenAddresses: ['/ip4/0.0.0.0/tcp/4181'],
          relayDataLimitBytes: 67_108_864,
        },
        mock(),
        { discoveryEnabled: true, publicationEnabled: true },
      );
      await flushPromises();
      await flushPromises();
      await directory.discover(network, mock());
      const handler = [...subscriptions.entries()].find(
        ([topic]) => !topic.endsWith('.request'),
      )?.[1];
      expect(handler).toBeDefined();
      await handler?.(
        JSON.stringify(
          PrivateNetworkRelayRecordCodec.seal(network, knownRelay),
        ),
      );
      const departedRelay: PrivateNetworkRelayRecord = {
        ...knownRelay,
        expiresAt: now + 1000,
        multiaddrs: ['/dns4/relay-c.example.com/tcp/4181/p2p/12D3KooWRelayC'],
        peerId: '12D3KooWRelayC',
      };
      await handler?.(
        JSON.stringify(
          PrivateNetworkRelayRecordCodec.seal(network, departedRelay),
        ),
      );
      now += 1001;
      publicConnection.publishPubSub.mockClear();
      publicConnection.findRecordProviderMultiaddrs.mockClear();

      await directory.discover(network, mock());
      expect(
        publicConnection.findRecordProviderMultiaddrs,
      ).toHaveBeenCalledTimes(1);
      expect(publicConnection.publishPubSub).toHaveBeenCalledWith(
        expect.stringMatching(/\.request$/),
        '',
      );
      await directory.discover(network, mock());
      expect(
        publicConnection.findRecordProviderMultiaddrs,
      ).toHaveBeenCalledTimes(1);

      now += 10_000;
      await directory.discover(network, mock());
      expect(
        publicConnection.findRecordProviderMultiaddrs,
      ).toHaveBeenCalledTimes(2);
      // A new valid record must make the publisher eligible for recovery again.
      await handler?.(
        JSON.stringify(
          PrivateNetworkRelayRecordCodec.seal(network, {
            ...departedRelay,
            expiresAt: now + 600_000,
            issuedAt: now,
          }),
        ),
      );
      await directory.discover(network, mock());
      await directory.discover(network, mock());
      expect(
        publicConnection.findRecordProviderMultiaddrs,
      ).toHaveBeenCalledTimes(4);
    } finally {
      directory.stop(network.getId());
      delete process.env.PIGEON_RELAY_RECORD_CONNECTED_DISCOVERY_INTERVAL_MS;
    }
  });

  it('should retry relay publisher discovery until a mesh peer connects', async () => {
    jest.useFakeTimers();
    const directory = createDirectory(localDatabase);
    const privateConnection = mock<IPFSConnection>();
    const publicConnection = mock<IPFSConnection>();
    const networkKey = privateKey();
    const network = privateNetwork(
      networkKey,
      privateConnection,
      '12D3KooWRelayA',
    );
    const remoteRelay: PrivateNetworkRelayRecord = {
      expiresAt: Date.now() + 60_000,
      issuedAt: Date.now(),
      multiaddrs: ['/dns4/relay-b.example.com/tcp/4181/p2p/12D3KooWRelayB'],
      peerId: '12D3KooWRelayB',
      role: 'relay',
      version: 1,
    };
    const subscriptions = new Map<string, (payload: string) => Promise<void>>();
    let privatePeers: string[] = [];

    privateConnection.getPeers.mockImplementation(() => privatePeers);
    privateConnection.dial.mockImplementation(async () => {
      privatePeers = [remoteRelay.peerId];
    });
    publicConnection.findRecordProviderMultiaddrs.mockResolvedValue([]);
    publicConnection.getPeers.mockReturnValue(['12D3KooWPublicPeer']);
    publicConnection.provideRecord.mockResolvedValue(true);
    publicConnection.publishPubSub.mockResolvedValue(undefined);
    publicConnection.subscribePubSub.mockImplementation((topic, handler) => {
      subscriptions.set(topic, handler);

      return Promise.resolve();
    });
    publicConnection.waitForPeers.mockResolvedValue(true);
    (
      directory as unknown as {
        getPublicConnection(): Promise<IPFSConnection>;
      }
    ).getPublicConnection = jest.fn().mockResolvedValue(publicConnection);

    try {
      directory.start(
        network,
        {
          announceAddresses: [
            '/dns4/relay-a.example.com/tcp/4181/p2p/12D3KooWRelayA',
          ],
          listenAddresses: ['/ip4/0.0.0.0/tcp/4181'],
          relayDataLimitBytes: 67_108_864,
        },
        mock(),
        {
          discoveryEnabled: true,
          publicationEnabled: true,
        },
      );
      await flushPromises();
      await flushPromises();

      expect(
        publicConnection.findRecordProviderMultiaddrs,
      ).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(1_000);
      await flushPromises();
      await flushPromises();

      expect(
        publicConnection.findRecordProviderMultiaddrs,
      ).toHaveBeenCalledTimes(2);

      const relayRecordHandler = [...subscriptions.entries()].find(
        ([topic]) => !topic.endsWith('.request'),
      )?.[1];

      expect(relayRecordHandler).toBeDefined();
      await relayRecordHandler?.(
        JSON.stringify(
          PrivateNetworkRelayRecordCodec.seal(network, remoteRelay),
        ),
      );

      jest.advanceTimersByTime(5_000);
      await flushPromises();
      await flushPromises();

      expect(
        publicConnection.findRecordProviderMultiaddrs,
      ).toHaveBeenCalledTimes(2);
    } finally {
      directory.stop(network.getId());
      jest.useRealTimers();
    }
  });

  it('should request a relay record when routed private relay dials fail', async () => {
    const directory = createDirectory(localDatabase);
    const privateConnection = mock<IPFSConnection>();
    const network = privateNetwork(
      privateKey(),
      privateConnection,
      '12D3KooWLeaf',
    );
    const publicConnection = mock<IPFSConnection>();

    privateConnection.dial.mockRejectedValue(new Error('private dial failed'));
    privateConnection.getMultiaddrs.mockReturnValue([]);
    privateConnection.getPeers.mockReturnValue([]);
    publicConnection.findRecordProviderMultiaddrs.mockResolvedValue([
      '/dns4/relay.example.com/tcp/4181/p2p/12D3KooWRelay',
    ]);
    publicConnection.getPeers.mockReturnValue(['12D3KooWPublicPeer']);
    publicConnection.publishPubSub.mockResolvedValue(undefined);
    publicConnection.subscribePubSub.mockResolvedValue(undefined);
    publicConnection.waitForPeers.mockResolvedValue(true);
    (
      directory as unknown as {
        getPublicConnection: () => Promise<IPFSConnection>;
      }
    ).getPublicConnection = jest.fn().mockResolvedValue(publicConnection);

    await directory.discover(network, mock());

    expect(publicConnection.dial).toHaveBeenCalledWith(
      expect.stringContaining('relay.example.com'),
      expect.any(AbortSignal),
    );
    expect(publicConnection.publishPubSub).toHaveBeenCalledWith(
      expect.stringContaining('.request'),
      '',
    );
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
    expect(getPublicConnection).not.toHaveBeenCalled();
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
      .spyOn(PublicIPFS, 'createRoutingConnection')
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
    const secondConnection = await directory.configurePublicConnection(options);

    expect(firstConnection).toBe(publicConnection);
    expect(secondConnection).toBe(publicConnection);
    expect(createPublicConnection).toHaveBeenCalledTimes(1);
    expect(publicConnection.stop).not.toHaveBeenCalled();
  });

  it('should preserve blocked public peers while resetting the peer cache', async () => {
    const directory = createDirectory(localDatabase);
    const storageLocation = path.join(
      localDatabasePath,
      'public-relay-record-directory',
    );
    const blockedPeersPath = path.join(storageLocation, 'blockedPeers.json');

    await fs.mkdir(path.join(storageLocation, 'datastore'), {
      recursive: true,
    });
    await fs.writeFile(blockedPeersPath, '["blocked-peer"]');
    await fs.writeFile(
      path.join(storageLocation, 'datastore', 'stale'),
      'cache',
    );

    await (
      directory as unknown as {
        preparePublicConnectionStorage(): Promise<void>;
      }
    ).preparePublicConnectionStorage();

    await expect(fs.readFile(blockedPeersPath, 'utf8')).resolves.toBe(
      '["blocked-peer"]',
    );
    await expect(
      fs.access(path.join(storageLocation, 'datastore')),
    ).rejects.toThrow();
  });

  it('should keep retrying initial discovery with bounded backoff while the relay stays disconnected', async () => {
    jest.useFakeTimers();
    process.env.PIGEON_RELAY_RECORD_DISCOVERY_INTERVAL_MS = '16000';
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

      // Delays double: 1s, 2s, 4s, 8s, then cap at the 16s interval.
      jest.advanceTimersByTime(1_000);
      await flushPromises();
      expect(discover).toHaveBeenCalledTimes(2);

      jest.advanceTimersByTime(2_000);
      await flushPromises();
      expect(discover).toHaveBeenCalledTimes(3);

      jest.advanceTimersByTime(4_000);
      await flushPromises();
      expect(discover).toHaveBeenCalledTimes(4);

      jest.advanceTimersByTime(8_000);
      await flushPromises();
      expect(discover).toHaveBeenCalledTimes(5);

      jest.advanceTimersByTime(16_000);
      await flushPromises();
      expect(discover).toHaveBeenCalledTimes(7);
    } finally {
      directory.stop(network.getId());
      delete process.env.PIGEON_RELAY_RECORD_DISCOVERY_INTERVAL_MS;
      jest.useRealTimers();
    }
  });

  it.each([false, true])(
    'should give the dial loser a full fallback window after an inbound connection: %s',
    async (reconnectInbound) => {
      jest.useFakeTimers();
      process.env.PIGEON_RELAY_RECORD_DISCOVERY_INTERVAL_MS = '5000';
      const directory = createDirectory(localDatabase);
      const privateConnection = mock<IPFSConnection>();
      const publicConnection = mock<IPFSConnection>();
      const networkKey = privateKey();
      // Local peer ID sorts after the remote one, so it loses the dial order.
      const network = privateNetwork(
        networkKey,
        privateConnection,
        '12D3KooWRelayZ',
      );
      const remoteRelay: PrivateNetworkRelayRecord = {
        expiresAt: Date.now() + 600_000,
        issuedAt: Date.now(),
        multiaddrs: ['/dns4/relay-b.example.com/tcp/4181/p2p/12D3KooWRelayB'],
        peerId: '12D3KooWRelayB',
        role: 'relay',
        version: 1,
      };
      const subscriptions = new Map<
        string,
        (payload: string) => Promise<void>
      >();
      let privatePeers: string[] = [];

      privateConnection.getPeers.mockImplementation(() => privatePeers);
      privateConnection.dial.mockImplementation(async () => {
        privatePeers = [remoteRelay.peerId];
      });
      publicConnection.findRecordProviderMultiaddrs.mockResolvedValue([]);
      publicConnection.getPeers.mockReturnValue(['12D3KooWPublicPeer']);
      publicConnection.provideRecord.mockResolvedValue(true);
      publicConnection.publishPubSub.mockResolvedValue(undefined);
      publicConnection.subscribePubSub.mockImplementation((topic, handler) => {
        subscriptions.set(topic, handler);

        return Promise.resolve();
      });
      publicConnection.waitForPeers.mockResolvedValue(true);
      (
        directory as unknown as {
          getPublicConnection(): Promise<IPFSConnection>;
        }
      ).getPublicConnection = jest.fn().mockResolvedValue(publicConnection);

      try {
        directory.start(
          network,
          {
            announceAddresses: [
              '/dns4/relay-z.example.com/tcp/4181/p2p/12D3KooWRelayZ',
            ],
            listenAddresses: ['/ip4/0.0.0.0/tcp/4181'],
            relayDataLimitBytes: 67_108_864,
          },
          mock(),
          {
            discoveryEnabled: true,
            publicationEnabled: true,
          },
        );
        await flushPromises();
        await flushPromises();

        const relayRecordHandler = [...subscriptions.entries()].find(
          ([topic]) => !topic.endsWith('.request'),
        )?.[1];

        expect(relayRecordHandler).toBeDefined();
        await relayRecordHandler?.(
          JSON.stringify(
            PrivateNetworkRelayRecordCodec.seal(network, remoteRelay),
          ),
        );
        await flushPromises();

        // The winning peer is expected to dial first.
        expect(privateConnection.dial).not.toHaveBeenCalled();

        if (reconnectInbound) {
          // Start a fallback window, then observe an inbound connection without
          // receiving another publisher record. A later drop needs a fresh window.
          for (let step = 0; step < 6; step += 1) {
            jest.advanceTimersByTime(5_000);
            await flushPromises();
            await flushPromises();
          }
          privatePeers = [remoteRelay.peerId];
          await directory.discover(network, mock());
          privatePeers = [];
          for (let step = 0; step < 5; step += 1) {
            jest.advanceTimersByTime(5_000);
            await flushPromises();
            await flushPromises();
          }
          expect(privateConnection.dial).not.toHaveBeenCalled();
        }

        // After the fallback window, this peer dials anyway instead of staying
        // partitioned behind a failed winning dial. Advance in interval-sized
        // steps so each discovery pass settles before the next tick.
        for (let step = 0; step < 10; step += 1) {
          jest.advanceTimersByTime(5_000);
          await flushPromises();
          await flushPromises();
        }

        expect(privateConnection.dial).toHaveBeenCalledWith(
          remoteRelay.multiaddrs[0],
          expect.anything(),
        );
      } finally {
        directory.stop(network.getId());
        delete process.env.PIGEON_RELAY_RECORD_DISCOVERY_INTERVAL_MS;
        jest.useRealTimers();
      }
    },
  );

  it('should fall back to every disconnected publisher even while another is connected and public IPFS is down', async () => {
    jest.useFakeTimers();
    process.env.PIGEON_RELAY_RECORD_DISCOVERY_INTERVAL_MS = '5000';
    const directory = createDirectory(localDatabase);
    const privateConnection = mock<IPFSConnection>();
    const publicConnection = mock<IPFSConnection>();
    const networkKey = privateKey();
    const network = privateNetwork(
      networkKey,
      privateConnection,
      '12D3KooWRelayZ',
    );
    const remoteRelays: PrivateNetworkRelayRecord[] = [
      '12D3KooWRelayB',
      '12D3KooWRelayC',
    ].map((peerId) => ({
      expiresAt: Date.now() + 600_000,
      issuedAt: Date.now(),
      multiaddrs: [
        `/dns4/${peerId.toLowerCase()}.example.com/tcp/4181/p2p/${peerId}`,
      ],
      peerId,
      role: 'relay' as const,
      version: 1,
    }));
    const subscriptions = new Map<string, (payload: string) => Promise<void>>();
    // Already connected to one publisher; B and C remain missing.
    const privatePeers: string[] = ['12D3KooWRelayA'];
    const dialedMultiaddrs: string[] = [];

    privateConnection.getPeers.mockImplementation(() => privatePeers);
    privateConnection.dial.mockImplementation(async (multiaddr: string) => {
      dialedMultiaddrs.push(multiaddr);
    });
    publicConnection.findRecordProviderMultiaddrs.mockResolvedValue([]);
    publicConnection.getPeers.mockReturnValue([]);
    publicConnection.provideRecord.mockResolvedValue(true);
    publicConnection.publishPubSub.mockResolvedValue(undefined);
    publicConnection.subscribePubSub.mockImplementation((topic, handler) => {
      subscriptions.set(topic, handler);

      return Promise.resolve();
    });
    // Public IPFS outage: no pubsub peers ever arrive.
    publicConnection.waitForPeers.mockResolvedValue(false);
    (
      directory as unknown as {
        getPublicConnection(): Promise<IPFSConnection>;
      }
    ).getPublicConnection = jest.fn().mockResolvedValue(publicConnection);

    try {
      directory.start(
        network,
        {
          announceAddresses: [
            '/dns4/relay-z.example.com/tcp/4181/p2p/12D3KooWRelayZ',
          ],
          listenAddresses: ['/ip4/0.0.0.0/tcp/4181'],
          relayDataLimitBytes: 67_108_864,
        },
        mock(),
        {
          discoveryEnabled: true,
          publicationEnabled: true,
        },
      );
      await flushPromises();
      await flushPromises();

      const relayRecordHandler = [...subscriptions.entries()].find(
        ([topic]) => !topic.endsWith('.request'),
      )?.[1];

      expect(relayRecordHandler).toBeDefined();

      for (const remoteRelay of remoteRelays) {
        await relayRecordHandler?.(
          JSON.stringify(
            PrivateNetworkRelayRecordCodec.seal(network, remoteRelay),
          ),
        );
      }
      await flushPromises();

      expect(dialedMultiaddrs).toEqual([]);

      for (let step = 0; step < 10; step += 1) {
        jest.advanceTimersByTime(5_000);
        await flushPromises();
        await flushPromises();
      }

      expect(dialedMultiaddrs).toEqual(
        expect.arrayContaining([
          remoteRelays[0].multiaddrs[0],
          remoteRelays[1].multiaddrs[0],
        ]),
      );
    } finally {
      directory.stop(network.getId());
      delete process.env.PIGEON_RELAY_RECORD_DISCOVERY_INTERVAL_MS;
      jest.useRealTimers();
    }
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
