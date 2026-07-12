const mockHeliaNode = {
  addRouter: jest.fn(),
  addMixin: jest.fn(),
  start: jest.fn().mockResolvedValue(undefined),
  datastore: { get: jest.fn(), put: jest.fn() },
  libp2p: {
    addEventListener: jest.fn(),
    dial: jest.fn().mockResolvedValue(undefined),
    getMultiaddrs: jest.fn().mockReturnValue([]),
    getPeers: jest.fn().mockReturnValue([]),
    peerId: { toString: () => 'mock-peer-id' },
  },
  routing: { get: jest.fn(), put: jest.fn() },
};

const mockCreateHelia = jest.fn().mockResolvedValue(mockHeliaNode);
const mockBootstrap = jest.fn().mockReturnValue('mock-bootstrap');
const mockFsBlockstore = jest.fn();
const mockFsDatastore = jest.fn();
const mockMemoryDatastore = jest.fn();
const mockPreSharedKey = jest.fn().mockReturnValue('mock-connection-protector');
const mockLibp2pDefaults = jest.fn().mockReturnValue({
  connectionEncrypters: [],
  services: {},
  streamMuxers: [],
  transports: [],
});
const mockCreateLibp2p = jest.fn().mockResolvedValue(mockHeliaNode.libp2p);
const mockWithHTTP = jest.fn().mockImplementation((helia: unknown) => helia);

jest.mock(
  'helia',
  () => ({
    createHeliaLight: mockCreateHelia,
  }),
  { virtual: true },
);

jest.mock(
  '@helia/libp2p',
  () => ({
    libp2pDefaults: mockLibp2pDefaults,
    withLibp2p: jest.fn().mockResolvedValue(mockHeliaNode),
  }),
  { virtual: true },
);

jest.mock(
  '@helia/bitswap',
  () => ({
    withBitswap: jest.fn().mockReturnValue(mockHeliaNode),
  }),
  { virtual: true },
);

jest.mock(
  '@helia/http',
  () => ({
    withHTTP: mockWithHTTP,
  }),
  { virtual: true },
);

jest.mock('@ipld/dag-cbor', () => ({}), { virtual: true });
jest.mock('@ipld/dag-json', () => ({}), { virtual: true });
jest.mock('multiformats/codecs/json', () => ({}), { virtual: true });
jest.mock('multiformats/hashes/sha2', () => ({ sha512: {} }), {
  virtual: true,
});

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
  '@libp2p/bootstrap',
  () => ({
    bootstrap: mockBootstrap,
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
    FsBlockstore: mockFsBlockstore,
  }),
  { virtual: true },
);

jest.mock(
  'datastore-core',
  () => ({
    MemoryDatastore: mockMemoryDatastore,
  }),
  { virtual: true },
);

jest.mock(
  'datastore-fs',
  () => ({
    FsDatastore: mockFsDatastore,
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

jest.mock(
  '@libp2p/gossipsub',
  () => ({
    gossipsub: jest.fn().mockReturnValue('mock-gossipsub'),
  }),
  { virtual: true },
);

jest.mock('@haskou/ddd-kernel', () => ({
  __esModule: true,
  default: {
    logger: {
      debug: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    },
  },
}));

import { PrivateKey } from '@haskou/value-objects';
import { createHash, createPrivateKey, generateKeyPairSync } from 'crypto';

import {
  PrivateIPFS,
  PrivateIPFSOptions,
} from '../../../../../../../src/contexts/shared/infrastructure/ipfs/networks/PrivateIPFS';
import { PublicRelayRecordPrimitives } from '../../../../../../../src/shared/infrastructure/network/relay/PublicRelayRecordPrimitives';
import { PublicRelayRecordRegistry } from '../../../../../../../src/shared/infrastructure/network/relay/PublicRelayRecordRegistry';

describe('PrivateIPFS', () => {
  const { privateKey: nodeKey } = generateKeyPairSync('ed25519');
  const validPem = nodeKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  const publicRelayRecordRegistry = new PublicRelayRecordRegistry();
  let previousPublicRelayRecordsPath: string | undefined;

  const defaultOptions: PrivateIPFSOptions = {
    key: new PrivateKey(validPem),
    name: 'test-network',
    storageLocation: 'memory',
  };

  beforeEach(() => {
    previousPublicRelayRecordsPath =
      process.env.PIGEON_PUBLIC_RELAY_RECORDS_PATH;
    delete process.env.PIGEON_PUBLIC_RELAY_RECORDS_PATH;
    publicRelayRecordRegistry.clear();
    (
      PrivateIPFS as unknown as { connectionPool: Record<string, unknown> }
    ).connectionPool = {};
    jest.clearAllMocks();
  });

  afterEach(() => {
    publicRelayRecordRegistry.clear();

    if (previousPublicRelayRecordsPath === undefined) {
      delete process.env.PIGEON_PUBLIC_RELAY_RECORDS_PATH;
    } else {
      process.env.PIGEON_PUBLIC_RELAY_RECORDS_PATH =
        previousPublicRelayRecordsPath;
    }
  });

  function publicRelayRecord(peerId: string): PublicRelayRecordPrimitives {
    return {
      expiresAt: Date.now() + 60_000,
      issuedAt: Date.now(),
      multiaddrs: [`/dns4/relay.example.com/tcp/4011/p2p/${peerId}`],
      peerId,
      publicKey: `${peerId}-public-key`,
      role: 'relay',
      signature: `${peerId}-signature`,
      version: 1,
    };
  }

  describe('create', () => {
    it('should create a new PrivateIPFS instance', async () => {
      const result = await PrivateIPFS.create(defaultOptions);

      expect(result).toBeInstanceOf(PrivateIPFS);
    });

    it('should not configure public HTTP routing or gateways', async () => {
      await PrivateIPFS.create(defaultOptions);

      expect(mockWithHTTP).not.toHaveBeenCalled();
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

    it('should not start a Kademlia DHT in a private network', async () => {
      mockLibp2pDefaults.mockReturnValueOnce({
        connectionEncrypters: [],
        services: { dht: 'mock-dht' },
        streamMuxers: [],
        transports: [],
      });

      await PrivateIPFS.create(defaultOptions);

      const [configuration] = mockCreateLibp2p.mock.calls[0];

      expect(
        (configuration as { services: Record<string, unknown> }).services.dht,
      ).toBeUndefined();
    });

    it('should create Helia with the configured storage', async () => {
      await PrivateIPFS.create(defaultOptions);

      expect(mockCreateHelia).toHaveBeenCalledWith(
        expect.objectContaining({
          blockstore: expect.anything(),
          datastore: expect.anything(),
        }),
      );
    });

    it('should configure manual relay multiaddrs as bootstrap relays', async () => {
      const multiaddr = '/dns4/relay.example.com/tcp/4100/p2p/12D3KooWRelay';

      await PrivateIPFS.create({
        ...defaultOptions,
        manualRelayMultiaddrs: [multiaddr],
      });

      expect(mockBootstrap).toHaveBeenCalledWith(
        expect.objectContaining({
          list: [multiaddr],
          tagName: 'pigeon-relay-bootstrap',
        }),
      );
    });

    it('should not configure public bootstrap peers for filesystem private networks', async () => {
      await PrivateIPFS.create({
        ...defaultOptions,
        storageLocation: '/tmp/pigeon-private-ipfs-test',
      });

      expect(mockBootstrap).not.toHaveBeenCalled();
    });

    it('should keep filesystem private network peer routing state in memory', async () => {
      await PrivateIPFS.create({
        ...defaultOptions,
        storageLocation: '/tmp/pigeon-private-ipfs-test',
      });

      expect(mockFsBlockstore).toHaveBeenCalledWith(
        '/tmp/pigeon-private-ipfs-test/blockstore',
      );
      expect(mockMemoryDatastore).toHaveBeenCalled();
      expect(mockFsDatastore).not.toHaveBeenCalled();
    });

    it('should register peer connection event listeners for deferred provider publication', async () => {
      await PrivateIPFS.create(defaultOptions);

      expect(mockHeliaNode.libp2p.addEventListener).toHaveBeenCalledWith(
        'peer:connect',
        expect.any(Function),
      );
    });

    it('should not dial cached public relay records advertised by itself', async () => {
      publicRelayRecordRegistry.save(publicRelayRecord('mock-peer-id'));

      await PrivateIPFS.create(defaultOptions);

      expect(mockHeliaNode.libp2p.dial).not.toHaveBeenCalled();
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
      const Kernel = (await import('@haskou/ddd-kernel')).default;

      await PrivateIPFS.create(defaultOptions);

      expect(Kernel.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('test-network'),
      );
      expect(Kernel.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('mock-peer-id'),
      );
    });
  });
});
