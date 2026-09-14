import { PrivateKey } from '@haskou/pigeon-swarm-crypto';
import { generateKeyPairSync } from 'crypto';
import * as fs from 'fs/promises';
import { mock } from 'jest-mock-extended';

jest.mock('fs/promises', () => ({
  mkdir: jest.fn(),
  mkdtemp: jest.fn(),
  link: jest.fn(),
  open: jest.fn(),
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

jest.mock('@haskou/ddd-kernel', () => ({
  __esModule: true,
  default: {
    logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  },
}));

import Kernel from '@haskou/ddd-kernel';
import { libp2pKeyAdapter } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';
import { Libp2pPrivateKeyLike } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/networks/adapters/types/Libp2pPrivateKeyLike';

import { IPFSNetwork } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { IPFSNetworkConfig } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import IPFSNetworkRegistry from '../../../../../../../src/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import PrivateNetworkRelayRecordDirectory from '../../../../../../../src/shared/infrastructure/network/relay/PrivateNetworkRelayRecordDirectory';

type IPFSNetworkRegistryTestGlobal = typeof globalThis & {
  __pigeonSwarmIPFSNetworkRegistryState?: unknown;
};

function restoreEnvVariable(
  name: keyof NodeJS.ProcessEnv,
  previousValue: string | undefined,
): void {
  if (previousValue === undefined) {
    delete process.env[name];

    return;
  }

  process.env[name] = previousValue;
}

function createRegistry(): IPFSNetworkRegistry {
  return new IPFSNetworkRegistry(mock<PrivateNetworkRelayRecordDirectory>());
}

describe('IPFSNetworkRegistry', () => {
  const { privateKey } = generateKeyPairSync('ed25519');
  const validPem = privateKey
    .export({ format: 'pem', type: 'pkcs8' })
    .toString();
  const previousStoragePath = process.env.IPFS_STORAGE_PATH;

  afterEach(() => {
    delete (globalThis as IPFSNetworkRegistryTestGlobal)
      .__pigeonSwarmIPFSNetworkRegistryState;

    restoreEnvVariable('IPFS_STORAGE_PATH', previousStoragePath);

    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe('shared peer identity', () => {
    const sync = jest.fn();
    const close = jest.fn();

    beforeEach(() => {
      jest.mocked(fs.mkdtemp).mockResolvedValue('/storage/.peer-key-test');
      jest.mocked(fs.link).mockResolvedValue(undefined);
      jest.mocked(fs.rm).mockResolvedValue(undefined);
      jest
        .mocked(fs.open)
        .mockResolvedValue({ sync, close } as unknown as fs.FileHandle);
      sync.mockResolvedValue(undefined);
      close.mockResolvedValue(undefined);
    });
    it('keeps concurrent consumers pending until persistence succeeds and shares a write failure', async () => {
      const missing = Object.assign(new Error('Not found'), { code: 'ENOENT' });
      const failedWrite = new Error('Write failed');
      const generatedKey = mock<Libp2pPrivateKeyLike>();
      const persistedKey = mock<Libp2pPrivateKeyLike>();
      let rejectWrite!: (error: Error) => void;
      const pendingWrite = new Promise<void>((_resolve, reject) => {
        rejectWrite = reject;
      });
      jest.mocked(fs.readFile).mockRejectedValue(missing);
      jest.mocked(fs.mkdir).mockResolvedValue(undefined);
      jest.mocked(fs.writeFile).mockReturnValueOnce(pendingWrite);
      jest
        .spyOn(libp2pKeyAdapter, 'generateEd25519KeyPair')
        .mockResolvedValue(generatedKey);
      jest
        .spyOn(libp2pKeyAdapter, 'privateKeyToProtobuf')
        .mockResolvedValue(Buffer.from('generated'));
      let completed = false;
      const first = createRegistry().getSharedPeerPrivateKey();
      await new Promise<void>((resolve) => setImmediate(resolve));
      const second = createRegistry().getSharedPeerPrivateKey();
      const results = Promise.allSettled([first, second]).then((values) => {
        completed = true;
        return values;
      });
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(fs.writeFile).toHaveBeenCalledTimes(1);
      expect(completed).toBe(false);
      rejectWrite(failedWrite);
      expect(await results).toEqual([
        { status: 'rejected', reason: failedWrite },
        { status: 'rejected', reason: failedWrite },
      ]);
      expect(fs.link).not.toHaveBeenCalled();
      expect(fs.rm).toHaveBeenCalledWith('/storage/.peer-key-test', {
        recursive: true,
        force: true,
      });
      jest.mocked(fs.readFile).mockResolvedValue(Buffer.from('persisted'));
      jest
        .spyOn(libp2pKeyAdapter, 'privateKeyFromProtobuf')
        .mockResolvedValue(persistedKey);
      expect(await createRegistry().getSharedPeerPrivateKey()).toBe(
        persistedKey,
      );
    });

    it('returns the same persisted key to concurrent startup consumers and after restart', async () => {
      const firstKey = mock<Libp2pPrivateKeyLike>();
      const competingKey = mock<Libp2pPrivateKeyLike>();
      const missing = Object.assign(new Error('Not found'), { code: 'ENOENT' });
      jest.mocked(fs.readFile).mockRejectedValue(missing);
      jest.mocked(fs.mkdir).mockResolvedValue(undefined);
      jest.mocked(fs.writeFile).mockResolvedValue(undefined);
      const generate = jest
        .spyOn(libp2pKeyAdapter, 'generateEd25519KeyPair')
        .mockResolvedValueOnce(firstKey)
        .mockResolvedValue(competingKey);
      jest
        .spyOn(libp2pKeyAdapter, 'privateKeyToProtobuf')
        .mockImplementation(async (key) =>
          Buffer.from(key === firstKey ? 'first' : 'competing'),
        );

      const keys = await Promise.all(
        Array.from({ length: 12 }, () =>
          createRegistry().getSharedPeerPrivateKey(),
        ),
      );

      expect(keys.every((key) => key === firstKey)).toBe(true);
      expect(generate).toHaveBeenCalledTimes(1);
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/storage/.peer-key-test/shared-peer-private-key.pb',
        Buffer.from('first'),
        { flag: 'wx', mode: 0o600, flush: true },
      );
      expect(fs.link).toHaveBeenCalledWith(
        '/storage/.peer-key-test/shared-peer-private-key.pb',
        expect.stringMatching(/shared-peer-private-key\.pb$/),
      );
      expect(sync).toHaveBeenCalledTimes(1);
      expect(close).toHaveBeenCalledTimes(1);
      delete (globalThis as IPFSNetworkRegistryTestGlobal)
        .__pigeonSwarmIPFSNetworkRegistryState;
      jest.mocked(fs.readFile).mockResolvedValue(Buffer.from('first'));
      jest
        .spyOn(libp2pKeyAdapter, 'privateKeyFromProtobuf')
        .mockResolvedValue(firstKey);
      expect(await createRegistry().getSharedPeerPrivateKey()).toBe(firstKey);
      expect(generate).toHaveBeenCalledTimes(1);
    });

    it('does not replace an unreadable existing key and allows retry after the read failure', async () => {
      const denied = Object.assign(new Error('Permission denied'), {
        code: 'EACCES',
      });
      const existingKey = mock<Libp2pPrivateKeyLike>();
      const generate = jest
        .spyOn(libp2pKeyAdapter, 'generateEd25519KeyPair')
        .mockResolvedValue(existingKey);
      jest
        .mocked(fs.readFile)
        .mockRejectedValueOnce(denied)
        .mockResolvedValue(Buffer.from('existing'));
      jest
        .spyOn(libp2pKeyAdapter, 'privateKeyFromProtobuf')
        .mockResolvedValue(existingKey);
      const registry = createRegistry();

      await expect(registry.getSharedPeerPrivateKey()).rejects.toBe(denied);
      expect(await registry.getSharedPeerPrivateKey()).toBe(existingKey);
      expect(generate).not.toHaveBeenCalled();
    });

    it('does not replace a malformed persisted key', async () => {
      const malformed = new Error('Malformed key');
      jest.mocked(fs.readFile).mockResolvedValue(Buffer.from('broken'));
      jest
        .spyOn(libp2pKeyAdapter, 'privateKeyFromProtobuf')
        .mockRejectedValue(malformed);
      const generate = jest
        .spyOn(libp2pKeyAdapter, 'generateEd25519KeyPair')
        .mockResolvedValue(mock<Libp2pPrivateKeyLike>());

      await expect(createRegistry().getSharedPeerPrivateKey()).rejects.toBe(
        malformed,
      );
      expect(generate).not.toHaveBeenCalled();
    });

    it('does not overwrite a key created before its exclusive write and retries from disk', async () => {
      const generatedKey = mock<Libp2pPrivateKeyLike>();
      const existingKey = mock<Libp2pPrivateKeyLike>();
      const missing = Object.assign(new Error('Not found'), { code: 'ENOENT' });
      const exists = Object.assign(new Error('Already exists'), {
        code: 'EEXIST',
      });
      jest
        .mocked(fs.readFile)
        .mockRejectedValueOnce(missing)
        .mockResolvedValue(Buffer.from('existing'));
      jest.mocked(fs.mkdir).mockResolvedValue(undefined);
      jest.mocked(fs.writeFile).mockResolvedValue(undefined);
      jest.mocked(fs.link).mockRejectedValueOnce(exists);
      const generate = jest
        .spyOn(libp2pKeyAdapter, 'generateEd25519KeyPair')
        .mockResolvedValue(generatedKey);
      jest
        .spyOn(libp2pKeyAdapter, 'privateKeyToProtobuf')
        .mockResolvedValue(Buffer.from('generated'));
      jest
        .spyOn(libp2pKeyAdapter, 'privateKeyFromProtobuf')
        .mockResolvedValue(existingKey);
      const registry = createRegistry();

      await expect(registry.getSharedPeerPrivateKey()).rejects.toBe(exists);
      expect(await registry.getSharedPeerPrivateKey()).toBe(existingKey);
      expect(generate).toHaveBeenCalledTimes(1);
    });
  });

  describe('register', () => {
    it('should allow the same peer id in different networks', async () => {
      const registry = createRegistry();
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
      const registry = createRegistry();
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
      const registry = createRegistry();
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

    it('should serialize deletion after an in-flight registration', async () => {
      process.env.IPFS_STORAGE_PATH = '/tmp/pigeon-swarm-ipfs';
      const registry = createRegistry();
      const network = mock<IPFSNetwork>();
      const registration = deferred<IPFSNetwork>();
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
        .mockReturnValue(registration.promise);

      const registering = registry.register(
        new IPFSNetworkConfig(
          'network-1',
          'private_1',
          new PrivateKey(validPem),
        ),
      );
      const deleting = registry.deleteNetwork('network-1');

      await Promise.resolve();

      expect(removeStorage).not.toHaveBeenCalled();

      registration.resolve(network);

      await registering;
      await deleting;

      expect(network.stop).toHaveBeenCalled();
      expect(removeStorage).toHaveBeenCalledWith(
        '/tmp/pigeon-swarm-ipfs/orbitdb/network-1',
        {
          force: true,
          recursive: true,
        },
      );
    });
  });

  describe('private relay bootstrap', () => {
    it('should disable private relay server when disabled by node settings', () => {
      const registry = createRegistry();

      registry.configureRelaySettings({
        privateRelay: {
          enabled: false,
          portEnd: 4199,
          portStart: 4100,
        },
      });
      const relayOptions = (
        registry as unknown as {
          getPrivateRelayListenAddresses: (networkId: string) =>
            | {
                listenAddresses: string[];
              }
            | undefined;
        }
      ).getPrivateRelayListenAddresses('network-1');

      expect(relayOptions).toBeUndefined();
    });

    it('should build private relay listen options from node settings', () => {
      const registry = createRegistry();

      registry.configureRelaySettings({
        privateRelay: {
          enabled: true,
          portEnd: 4100,
          portStart: 4100,
        },
        publicHost: 'relay.example.com',
      });
      const relayOptions = (
        registry as unknown as {
          getPrivateRelayListenAddresses: (networkId: string) =>
            | {
                announceAddresses?: string[];
                listenAddresses: string[];
              }
            | undefined;
        }
      ).getPrivateRelayListenAddresses('network-1');

      expect(relayOptions).toEqual(
        expect.objectContaining({
          announceAddresses: ['/dns4/relay.example.com/tcp/4100'],
          listenAddresses: ['/ip4/0.0.0.0/tcp/4100'],
        }),
      );
    });
  });

  describe('getConnectedRelayPeerIds', () => {
    it('should return unique connected relay peers from every network', () => {
      const registry = createRegistry();
      const firstNetwork = mock<IPFSNetwork>();
      const secondNetwork = mock<IPFSNetwork>();
      const publicNetwork = mock<IPFSNetwork>();

      firstNetwork.isPrivate.mockReturnValue(true);
      firstNetwork.getConnectedRelayPeerIds.mockReturnValue([
        '12D3KooWSharedRelay',
      ]);
      secondNetwork.isPrivate.mockReturnValue(true);
      secondNetwork.getConnectedRelayPeerIds.mockReturnValue([
        '12D3KooWSharedRelay',
        '12D3KooWOtherRelay',
      ]);
      publicNetwork.isPrivate.mockReturnValue(false);
      publicNetwork.getConnectedRelayPeerIds.mockReturnValue([
        '12D3KooWPublicRelay',
      ]);
      jest
        .spyOn(registry, 'getAll')
        .mockReturnValue([firstNetwork, secondNetwork, publicNetwork]);

      expect(registry.getConnectedRelayPeerIds()).toEqual([
        '12D3KooWSharedRelay',
        '12D3KooWOtherRelay',
      ]);
    });
  });

  describe('deleteNetwork', () => {
    it('should delete IPFS and OrbitDB storage for the network', async () => {
      process.env.IPFS_STORAGE_PATH = '/tmp/pigeon-swarm-ipfs';
      const registry = createRegistry();
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

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });

  return { promise, resolve };
}
