const mockHeliaNode = {
  datastore: { get: jest.fn(), put: jest.fn() },
  libp2p: {
    addEventListener: jest.fn(),
    dial: jest.fn().mockResolvedValue(undefined),
    getPeers: jest.fn().mockReturnValue([]),
    peerId: { toString: () => 'mock-peer-id' },
  },
  routing: { get: jest.fn(), put: jest.fn() },
};

const mockCreateHelia = jest.fn().mockResolvedValue(mockHeliaNode);
const mockPreSharedKey = jest.fn().mockReturnValue('mock-connection-protector');
const mockLibp2pDefaults = jest.fn().mockReturnValue({
  connectionEncrypters: [],
  services: {},
  streamMuxers: [],
  transports: [],
});
const mockCreateLibp2p = jest.fn().mockResolvedValue(mockHeliaNode.libp2p);
const mockMultiaddr = jest
  .fn()
  .mockImplementation((address: string) => `mock-multiaddr:${address}`);

jest.mock(
  'helia',
  () => ({
    createHelia: mockCreateHelia,
    libp2pDefaults: mockLibp2pDefaults,
  }),
  { virtual: true },
);

jest.mock(
  'libp2p',
  () => ({
    createLibp2p: mockCreateLibp2p,
  }),
  { virtual: true },
);

jest.mock(
  '@multiformats/multiaddr',
  () => ({
    multiaddr: mockMultiaddr,
  }),
  { virtual: true },
);

jest.mock(
  '@helia/json',
  () => ({
    json: jest.fn().mockReturnValue({
      add: jest.fn().mockResolvedValue({ toString: () => 'bafymockcid' }),
      get: jest.fn().mockResolvedValue({ test: true }),
    }),
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
    Key: jest.fn().mockImplementation((k: string) => ({ key: k })),
  }),
  { virtual: true },
);

jest.mock(
  'multiformats/cid',
  () => ({
    CID: {
      parse: jest.fn().mockReturnValue({ toString: () => 'bafymockcid' }),
    },
  }),
  { virtual: true },
);

jest.mock(
  '@libp2p/pnet',
  () => ({
    preSharedKey: mockPreSharedKey,
  }),
  { virtual: true },
);

jest.mock('@app/Kernel', () => ({
  __esModule: true,
  default: {
    logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  },
}));

import { PrivateKey } from '@haskou/value-objects';
import { createHash, createPrivateKey, generateKeyPairSync } from 'crypto';

import {
  PrivateIPFS,
  PrivateIPFSOptions,
} from '../../../../../../../src/contexts/shared/infrastructure/ipfs/networks/PrivateIPFS';

describe('PrivateIPFS', () => {
  const { privateKey: nodeKey } = generateKeyPairSync('ed25519');
  const validPem = nodeKey.export({ format: 'pem', type: 'pkcs8' }).toString();

  const defaultOptions: PrivateIPFSOptions = {
    key: new PrivateKey(validPem),
    name: 'test-network',
    storageLocation: 'memory',
  };

  beforeEach(() => {
    (
      PrivateIPFS as unknown as { connectionPool: Record<string, unknown> }
    ).connectionPool = {};
    delete process.env.IPFS_PRIVATE_BOOTSTRAP_PEERS;
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new PrivateIPFS instance', async () => {
      const result = await PrivateIPFS.create(defaultOptions);

      expect(result).toBeInstanceOf(PrivateIPFS);
    });

    it('should use preSharedKey with the provided key', async () => {
      await PrivateIPFS.create(defaultOptions);

      const keyObject = createPrivateKey(defaultOptions.key.valueOf());
      const jwk = keyObject.export({ format: 'jwk' }) as { d: string };
      const pskSeed = new Uint8Array(Buffer.from(jwk.d, 'base64url'));
      const pskHex = createHash('sha256').update(pskSeed).digest('hex');
      const expectedPsk = new Uint8Array(
        Buffer.from(`/key/swarm/psk/1.0.0/\n/base16/\n${pskHex}`),
      );

      expect(mockPreSharedKey).toHaveBeenCalledWith({ psk: expectedPsk });
    });

    it('should pass connectionProtector to createLibp2p', async () => {
      await PrivateIPFS.create(defaultOptions);

      expect(mockCreateLibp2p).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionProtector: 'mock-connection-protector',
        }),
      );

      expect(mockLibp2pDefaults).toHaveBeenCalled();
    });

    it('should pass created libp2p instance to createHelia', async () => {
      await PrivateIPFS.create(defaultOptions);

      expect(mockCreateHelia).toHaveBeenCalledWith(
        expect.objectContaining({
          libp2p: mockHeliaNode.libp2p,
        }),
      );
    });

    it('should register peer:connect listener', async () => {
      await PrivateIPFS.create(defaultOptions);

      expect(mockHeliaNode.libp2p.addEventListener).toHaveBeenCalledWith(
        'peer:connect',
        expect.any(Function),
      );
    });

    it('should reuse connection from pool on second call with same options', async () => {
      await PrivateIPFS.create(defaultOptions);
      await PrivateIPFS.create(defaultOptions);

      expect(mockCreateHelia).toHaveBeenCalledTimes(1);
    });

    it('should create separate connections for different network names', async () => {
      await PrivateIPFS.create({ ...defaultOptions, name: 'network-a' });
      await PrivateIPFS.create({ ...defaultOptions, name: 'network-b' });

      expect(mockCreateHelia).toHaveBeenCalledTimes(2);
    });

    it('should log the network name and peer id', async () => {
      const Kernel = (await import('@app/Kernel')).default;

      await PrivateIPFS.create(defaultOptions);

      expect(Kernel.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('test-network'),
      );
      expect(Kernel.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('mock-peer-id'),
      );
    });

    it('should dial bootstrap peers from environment variable', async () => {
      process.env.IPFS_PRIVATE_BOOTSTRAP_PEERS =
        '/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW111,/ip4/127.0.0.1/tcp/4002/p2p/12D3KooW222';

      await PrivateIPFS.create(defaultOptions);

      expect(mockHeliaNode.libp2p.dial).toHaveBeenCalledTimes(2);
      expect(mockHeliaNode.libp2p.dial).toHaveBeenNthCalledWith(1, [
        'mock-multiaddr:/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW111',
      ]);
      expect(mockHeliaNode.libp2p.dial).toHaveBeenNthCalledWith(2, [
        'mock-multiaddr:/ip4/127.0.0.1/tcp/4002/p2p/12D3KooW222',
      ]);

      expect(mockMultiaddr).toHaveBeenCalledTimes(2);
    });

    it('should skip self bootstrap dial', async () => {
      const Kernel = (await import('@app/Kernel')).default;
      process.env.IPFS_PRIVATE_BOOTSTRAP_PEERS =
        '/ip4/127.0.0.1/tcp/4001/p2p/mock-peer-id';

      await PrivateIPFS.create(defaultOptions);

      expect(mockHeliaNode.libp2p.dial).not.toHaveBeenCalled();
      expect(Kernel.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Skipping bootstrap self-dial'),
      );
    });
  });
});
