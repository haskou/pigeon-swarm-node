import { PrivateKey } from '@haskou/value-objects';
import { generateKeyPairSync } from 'crypto';
import * as fs from 'fs/promises';
import { mock } from 'jest-mock-extended';

jest.mock('fs/promises', () => ({
  mkdir: jest.fn(),
  readFile: jest.fn(),
  rm: jest.fn(),
  writeFile: jest.fn(),
}));

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

type IPFSNetworkRegistryTestGlobal = typeof globalThis & {
  __pigeonSwarmIPFSNetworkRegistryState?: unknown;
};

describe('IPFSNetworkRegistry', () => {
  const { privateKey } = generateKeyPairSync('ed25519');
  const validPem = privateKey
    .export({ format: 'pem', type: 'pkcs8' })
    .toString();
  const previousStoragePath = process.env.IPFS_STORAGE_PATH;

  afterEach(() => {
    delete (globalThis as IPFSNetworkRegistryTestGlobal)
      .__pigeonSwarmIPFSNetworkRegistryState;

    if (previousStoragePath === undefined) {
      delete process.env.IPFS_STORAGE_PATH;
    } else {
      process.env.IPFS_STORAGE_PATH = previousStoragePath;
    }

    jest.restoreAllMocks();
  });

  describe('register', () => {
    it('should allow the same peer id in different networks', async () => {
      const registry = new IPFSNetworkRegistry();
      const existingNetwork = mock<IPFSNetwork>();
      const duplicatedNetwork = mock<IPFSNetwork>();

      existingNetwork.getId.mockReturnValue(
        '550e8400-e29b-41d4-a716-446655440000',
      );
      existingNetwork.getName.mockReturnValue('private_0');
      existingNetwork.getPeerId.mockReturnValue('12D3KooWDuplicatedPeerId');

      duplicatedNetwork.getId.mockReturnValue(
        '550e8400-e29b-41d4-a716-446655440001',
      );
      duplicatedNetwork.getName.mockReturnValue('private_1');
      duplicatedNetwork.getPeerId.mockReturnValue('12D3KooWDuplicatedPeerId');

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
        .mockResolvedValueOnce(existingNetwork)
        .mockResolvedValueOnce(duplicatedNetwork);

      await registry.register(
        new IPFSNetworkConfig(
          '550e8400-e29b-41d4-a716-446655440000',
          'private_0',
          new PrivateKey(validPem),
        ),
      );

      await registry.register(
        new IPFSNetworkConfig(
          '550e8400-e29b-41d4-a716-446655440001',
          'private_1',
          new PrivateKey(validPem),
        ),
      );

      expect(registry.getAll()).toEqual([existingNetwork, duplicatedNetwork]);
    });

    it('should allow different network ids with the same name', async () => {
      const registry = new IPFSNetworkRegistry();
      const existingNetwork = mock<IPFSNetwork>();
      const duplicatedNameNetwork = mock<IPFSNetwork>();

      existingNetwork.getId.mockReturnValue('network-1');
      existingNetwork.getName.mockReturnValue('shared-name');
      duplicatedNameNetwork.getId.mockReturnValue('network-2');
      duplicatedNameNetwork.getName.mockReturnValue('shared-name');

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
        .mockResolvedValueOnce(existingNetwork)
        .mockResolvedValueOnce(duplicatedNameNetwork);

      await registry.register(
        new IPFSNetworkConfig(
          'network-1',
          'shared-name',
          new PrivateKey(validPem),
        ),
      );

      await registry.register(
        new IPFSNetworkConfig(
          'network-2',
          'shared-name',
          new PrivateKey(validPem),
        ),
      );

      expect(registry.getAll()).toEqual([
        existingNetwork,
        duplicatedNameNetwork,
      ]);
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
  });

  describe('deleteNetwork', () => {
    it('should delete IPFS and OrbitDB storage for the network', async () => {
      process.env.IPFS_STORAGE_PATH = '/tmp/pigeon-swarm-ipfs';
      const registry = new IPFSNetworkRegistry();
      const network = mock<IPFSNetwork>();
      const removeStorage = fs.rm as jest.MockedFunction<typeof fs.rm>;
      removeStorage.mockResolvedValue(undefined);

      network.getId.mockReturnValue('network-1');
      network.stop.mockResolvedValue(undefined);

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

      await registry.register(
        new IPFSNetworkConfig(
          'network-1',
          'private_1',
          new PrivateKey(validPem),
        ),
      );

      await registry.deleteNetwork('network-1');

      expect(network.stop).toHaveBeenCalled();
      expect(removeStorage).toHaveBeenCalledWith(
        '/tmp/pigeon-swarm-ipfs/network-1',
        {
          force: true,
          recursive: true,
        },
      );
      expect(removeStorage).toHaveBeenCalledWith(
        '/tmp/pigeon-swarm-ipfs/orbitdb/network-1',
        {
          force: true,
          recursive: true,
        },
      );
    });
  });
});
