import { PrivateKey } from '@haskou/value-objects';
import { generateKeyPairSync } from 'crypto';
import { mock } from 'jest-mock-extended';

jest.mock(
  '@libp2p/crypto/keys',
  () => ({
    generateKeyPair: jest.fn(),
    privateKeyFromProtobuf: jest.fn(),
    privateKeyToProtobuf: jest.fn(),
  }),
  { virtual: true },
);

jest.mock(
  '@libp2p/peer-id',
  () => ({
    peerIdFromPrivateKey: jest.fn().mockReturnValue({
      toString: () => '12D3KooWMockPeerId',
    }),
  }),
  { virtual: true },
);

jest.mock(
  '@helia/json',
  () => ({
    json: jest.fn(),
  }),
  { virtual: true },
);

jest.mock(
  '@multiformats/multiaddr',
  () => ({
    multiaddr: jest.fn(),
  }),
  { virtual: true },
);

jest.mock(
  'helia',
  () => ({
    createHelia: jest.fn(),
    libp2pDefaults: jest.fn().mockReturnValue({
      connectionEncrypters: [],
      services: {},
      streamMuxers: [],
      transports: [],
    }),
  }),
  { virtual: true },
);

jest.mock(
  'libp2p',
  () => ({
    createLibp2p: jest.fn(),
  }),
  { virtual: true },
);

jest.mock(
  '@libp2p/pnet',
  () => ({
    preSharedKey: jest.fn(),
  }),
  { virtual: true },
);

jest.mock(
  'blockstore-core',
  () => ({
    MemoryBlockstore: jest.fn(),
  }),
  { virtual: true },
);

jest.mock(
  'blockstore-fs',
  () => ({
    FsBlockstore: jest.fn(),
  }),
  { virtual: true },
);

jest.mock(
  'datastore-core',
  () => ({
    MemoryDatastore: jest.fn(),
  }),
  { virtual: true },
);

jest.mock(
  'datastore-fs',
  () => ({
    FsDatastore: jest.fn(),
  }),
  { virtual: true },
);

jest.mock(
  'interface-datastore/key',
  () => ({
    Key: jest.fn(),
  }),
  { virtual: true },
);

jest.mock(
  'multiformats/cid',
  () => ({
    CID: { parse: jest.fn() },
  }),
  { virtual: true },
);

jest.mock('@app/Kernel', () => ({
  __esModule: true,
  default: {
    logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  },
}));

import { IPFSNetwork } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { IPFSNetworkConfig } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import IPFSNetworkRegistry from '../../../../../../../src/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { PublicIPFS } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/networks/PublicIPFS';
import { IPFSConnection } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/helia/IPFSConnection';

describe('IPFSNetworkRegistry', () => {
  const { privateKey } = generateKeyPairSync('ed25519');
  const validPem = privateKey
    .export({ format: 'pem', type: 'pkcs8' })
    .toString();
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('register', () => {
    it('should allow the same peer id in different networks', async () => {
      const registry = new IPFSNetworkRegistry();
      const existingNetwork = mock<IPFSNetwork>();
      const duplicatedNetwork = mock<IPFSNetwork>();

      existingNetwork.getName.mockReturnValue('private_0');
      existingNetwork.getPeerId.mockReturnValue('12D3KooWDuplicatedPeerId');

      duplicatedNetwork.getName.mockReturnValue('private_1');
      duplicatedNetwork.getPeerId.mockReturnValue('12D3KooWDuplicatedPeerId');

      (
        registry as unknown as {
          networks: IPFSNetwork[];
        }
      ).networks = [existingNetwork];

      jest
        .spyOn(
          registry as unknown as {
            loadOrCreateSharedPeerPrivateKey: () => Promise<unknown>;
          },
          'loadOrCreateSharedPeerPrivateKey',
        )
        .mockResolvedValue({});

      jest
        .spyOn(
          registry as unknown as {
            createNetworkFromConfig: () => Promise<IPFSNetwork>;
          },
          'createNetworkFromConfig',
        )
        .mockResolvedValue(duplicatedNetwork);

      await registry.register(
        new IPFSNetworkConfig(
          '550e8400-e29b-41d4-a716-446655440000',
          'private_1',
          new PrivateKey(validPem),
        ),
      );

      expect(
        (
          registry as unknown as {
            networks: IPFSNetwork[];
          }
        ).networks,
      ).toEqual([existingNetwork, duplicatedNetwork]);
    });

    it('should allow different network ids with the same name', async () => {
      const registry = new IPFSNetworkRegistry();
      const existingNetwork = mock<IPFSNetwork>();
      const duplicatedNameNetwork = mock<IPFSNetwork>();

      existingNetwork.getId.mockReturnValue('network-1');
      existingNetwork.getName.mockReturnValue('shared-name');
      duplicatedNameNetwork.getId.mockReturnValue('network-2');
      duplicatedNameNetwork.getName.mockReturnValue('shared-name');

      (
        registry as unknown as {
          networks: IPFSNetwork[];
        }
      ).networks = [existingNetwork];

      jest
        .spyOn(
          registry as unknown as {
            loadOrCreateSharedPeerPrivateKey: () => Promise<unknown>;
          },
          'loadOrCreateSharedPeerPrivateKey',
        )
        .mockResolvedValue({});

      jest
        .spyOn(
          registry as unknown as {
            createNetworkFromConfig: () => Promise<IPFSNetwork>;
          },
          'createNetworkFromConfig',
        )
        .mockResolvedValue(duplicatedNameNetwork);

      await registry.register(
        new IPFSNetworkConfig(
          'network-2',
          'shared-name',
          new PrivateKey(validPem),
        ),
      );

      expect(
        (
          registry as unknown as {
            networks: IPFSNetwork[];
          }
        ).networks,
      ).toEqual([existingNetwork, duplicatedNameNetwork]);
    });

    it('should notify listeners when a network is registered', async () => {
      const registry = new IPFSNetworkRegistry();
      const network = mock<IPFSNetwork>();
      const listener = jest.fn();

      jest
        .spyOn(
          registry as unknown as {
            loadOrCreateSharedPeerPrivateKey: () => Promise<unknown>;
          },
          'loadOrCreateSharedPeerPrivateKey',
        )
        .mockResolvedValue({});

      jest
        .spyOn(
          registry as unknown as {
            createNetworkFromConfig: () => Promise<IPFSNetwork>;
          },
          'createNetworkFromConfig',
        )
        .mockResolvedValue(network);

      registry.onNetworkRegistered(listener);

      await registry.register(
        new IPFSNetworkConfig(
          '550e8400-e29b-41d4-a716-446655440000',
          'private_1',
          new PrivateKey(validPem),
        ),
      );

      expect(listener).toHaveBeenCalledWith(network);
    });

    it('should pass configured libp2p addresses to registered networks', async () => {
      process.env.IPFS_LIBP2P_ANNOUNCE_MULTIADDRS =
        '/dns4/pigeon.example/tcp/4001, /dns4/pigeon-backup.example/tcp/4001';
      process.env.IPFS_LIBP2P_LISTEN_MULTIADDRS = '/ip4/0.0.0.0/tcp/4001';

      const registry = new IPFSNetworkRegistry();
      const connection = mock<IPFSConnection>();

      (
        registry as unknown as {
          networks: IPFSNetwork[];
        }
      ).networks = [];

      jest
        .spyOn(
          registry as unknown as {
            loadOrCreateSharedPeerPrivateKey: () => Promise<unknown>;
          },
          'loadOrCreateSharedPeerPrivateKey',
        )
        .mockResolvedValue({});
      jest
        .spyOn(PublicIPFS, 'create')
        .mockResolvedValue(connection);

      await registry.register(new IPFSNetworkConfig('public-network', 'public'));

      expect(PublicIPFS.create).toHaveBeenCalledWith(
        expect.objectContaining({
          announceMultiaddrs: [
            '/dns4/pigeon.example/tcp/4001',
            '/dns4/pigeon-backup.example/tcp/4001',
          ],
          listenMultiaddrs: ['/ip4/0.0.0.0/tcp/4001'],
        }),
      );
    });

    it('should expand libp2p address templates with the assigned network port', async () => {
      process.env.IPFS_LIBP2P_ANNOUNCE_MULTIADDRS =
        '/dns4/pigeon.example/tcp/{port}';
      process.env.IPFS_LIBP2P_LISTEN_MULTIADDRS = '/ip4/0.0.0.0/tcp/{port}';
      process.env.IPFS_LIBP2P_LISTEN_PORT_RANGE = '4001-4010';

      const registry = new IPFSNetworkRegistry();
      const existingNetwork = mock<IPFSNetwork>();
      const connection = mock<IPFSConnection>();

      (
        registry as unknown as {
          networks: IPFSNetwork[];
        }
      ).networks = [existingNetwork];

      existingNetwork.getId.mockReturnValue('existing-network');
      jest
        .spyOn(
          registry as unknown as {
            loadOrCreateSharedPeerPrivateKey: () => Promise<unknown>;
          },
          'loadOrCreateSharedPeerPrivateKey',
        )
        .mockResolvedValue({});
      jest.spyOn(PublicIPFS, 'create').mockResolvedValue(connection);

      await registry.register(new IPFSNetworkConfig('public-network', 'public'));

      expect(PublicIPFS.create).toHaveBeenCalledWith(
        expect.objectContaining({
          announceMultiaddrs: ['/dns4/pigeon.example/tcp/4002'],
          listenMultiaddrs: ['/ip4/0.0.0.0/tcp/4002'],
        }),
      );
    });
  });
});
