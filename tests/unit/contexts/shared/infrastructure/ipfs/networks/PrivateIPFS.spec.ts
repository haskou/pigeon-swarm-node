const mockHeliaNode = {
  datastore: { get: jest.fn(), put: jest.fn() },
  libp2p: {
    addEventListener: jest.fn(),
    dial: jest.fn().mockResolvedValue(undefined),
    getPeers: jest.fn().mockReturnValue([]),
    peerId: { toString: () => 'mock-peer-id' },
  },
  routing: {
    findProviders: jest.fn(),
    get: jest.fn(),
    provide: jest.fn(),
    put: jest.fn(),
  },
};

const mockCreateHelia = jest.fn().mockResolvedValue(mockHeliaNode);
const mockBitswap = jest.fn().mockReturnValue('mock-bitswap');
const mockLibp2pRouting = jest.fn().mockReturnValue('mock-libp2p-routing');
const mockPreSharedKey = jest.fn().mockReturnValue('mock-connection-protector');
const mockLibp2pDefaults = jest.fn().mockReturnValue({
  connectionEncrypters: [],
  services: {},
  streamMuxers: [],
  transports: [],
});
const mockCreateLibp2p = jest.fn().mockResolvedValue(mockHeliaNode.libp2p);

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
  '@helia/block-brokers',
  () => ({
    bitswap: mockBitswap,
  }),
  { virtual: true },
);

jest.mock(
  '@helia/routers',
  () => ({
    libp2pRouting: mockLibp2pRouting,
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
          blockBrokers: ['mock-bitswap'],
          libp2p: mockHeliaNode.libp2p,
          routers: ['mock-libp2p-routing'],
        }),
      );
      expect(mockLibp2pRouting).toHaveBeenCalledWith(mockHeliaNode.libp2p);
    });

    it('should not register connection event listeners', async () => {
      await PrivateIPFS.create(defaultOptions);

      expect(mockHeliaNode.libp2p.addEventListener).not.toHaveBeenCalled();
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
      const infoSpy = jest.spyOn(console, 'info').mockImplementation();

      await PrivateIPFS.create(defaultOptions);

      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining('test-network'),
      );
      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining('mock-peer-id'),
      );
      infoSpy.mockRestore();
    });
  });
});
