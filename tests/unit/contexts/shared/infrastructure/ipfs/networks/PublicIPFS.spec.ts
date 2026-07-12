let peerConnectListeners: Array<(event: Event) => void> = [];

const mockHeliaNode = {
  addRouter: jest.fn(),
  addMixin: jest.fn(),
  start: jest.fn().mockResolvedValue(undefined),
  blockstore: {
    delete: jest.fn(),
    get: jest.fn(),
    has: jest.fn(),
  },
  datastore: { get: jest.fn(), put: jest.fn() },
  libp2p: {
    addEventListener: jest.fn(
      (event: string, listener: (event: Event) => void): void => {
        if (event === 'peer:connect') {
          peerConnectListeners.push(listener);
        }
      },
    ),
    getPeers: jest.fn().mockReturnValue([]),
    peerId: { toString: () => 'mock-peer-id' },
  },
  pins: {
    add: jest.fn(),
    isPinned: jest.fn(),
    rm: jest.fn(),
  },
  routing: { get: jest.fn(), provide: jest.fn(), put: jest.fn() },
};

async function* pinResults(cid: { toString(): string }) {
  yield cid;
}

function emitPeerConnect(peerId: string = 'peer-id'): void {
  for (const listener of peerConnectListeners) {
    listener({
      detail: {
        remotePeer: {
          toString: () => peerId,
        },
      },
    } as unknown as Event);
  }
}

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
}

const mockCreateHelia = jest.fn().mockResolvedValue(mockHeliaNode);
const mockCreateLibp2p = jest.fn().mockResolvedValue(mockHeliaNode.libp2p);
const mockPreSharedKey = jest.fn().mockReturnValue('mock-connection-protector');
const mockMultiaddr = jest
  .fn()
  .mockImplementation((address: string) => `mock-multiaddr:${address}`);
const mockParseCid = jest
  .fn()
  .mockReturnValue({ code: 0x70, toString: () => 'bafymockcid' });
const mockUnixfsAddBytes = jest
  .fn()
  .mockResolvedValue({ toString: () => 'bafymockcid' });
const mockUnixfsCat = jest.fn();
const mockUnixfsRm = jest
  .fn()
  .mockResolvedValue({ toString: () => 'bafymockcid' });
const mockDagPbDecode = jest.fn();

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
    libp2pDefaults: jest.fn().mockReturnValue({
      connectionEncrypters: [],
      services: {},
      streamMuxers: [],
      transports: [],
    }),
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
  '@libp2p/gossipsub',
  () => ({
    gossipsub: jest.fn().mockReturnValue('mock-gossipsub'),
  }),
  { virtual: true },
);

jest.mock(
  '@libp2p/bootstrap',
  () => ({
    bootstrap: jest.fn().mockReturnValue('mock-bootstrap'),
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
  '@helia/unixfs',
  () => ({
    unixfs: jest.fn().mockReturnValue({
      addBytes: mockUnixfsAddBytes,
      cat: mockUnixfsCat,
      rm: mockUnixfsRm,
    }),
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
  '@ipld/dag-pb',
  () => ({
    decode: mockDagPbDecode,
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
  '@libp2p/pnet',
  () => ({
    preSharedKey: mockPreSharedKey,
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
      parse: mockParseCid,
    },
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

import { IPFSBlockNotFoundOfflineError } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/errors/IPFSBlockNotFoundOfflineError';
import { IPFSBlockNotFoundPublicError } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/errors/IPFSBlockNotFoundPublicError';
import { IPFSId } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import { PublicIPFS } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/networks/PublicIPFS';

describe('PublicIPFS', () => {
  beforeEach(() => {
    (
      PublicIPFS as unknown as { connectionPool: Record<string, unknown> }
    ).connectionPool = {};
    peerConnectListeners = [];
    jest.clearAllMocks();
    mockHeliaNode.libp2p.getPeers.mockReturnValue([]);
    mockParseCid.mockReturnValue({ code: 0x70, toString: () => 'bafymockcid' });
    mockHeliaNode.pins.add.mockReturnValue(
      pinResults({ toString: () => 'bafymockcid' }),
    );
    mockHeliaNode.pins.isPinned.mockResolvedValue(false);
    mockHeliaNode.pins.rm.mockReturnValue(
      pinResults({ toString: () => 'bafymockcid' }),
    );
    mockUnixfsAddBytes.mockResolvedValue({ toString: () => 'bafymockcid' });
    mockUnixfsCat.mockReturnValue(
      (async function* bytes() {
        yield new Uint8Array([1, 2, 3]);
      })(),
    );
    mockUnixfsRm.mockResolvedValue({ toString: () => 'bafymockcid' });
    mockDagPbDecode.mockReturnValue({ Links: [] });
  });

  describe('create', () => {
    it('should create a new PublicIPFS instance with memory storage', async () => {
      const options = { storageLocation: 'memory' as const };

      const result = await PublicIPFS.create(options);

      expect(result).toBeInstanceOf(PublicIPFS);
    });

    it('should reuse connection from pool on second call with same options', async () => {
      const options = { storageLocation: 'memory' as const };

      await PublicIPFS.create(options);
      await PublicIPFS.create(options);

      expect(mockCreateHelia).toHaveBeenCalledTimes(1);
    });

    it('should create separate connections for different options', async () => {
      await PublicIPFS.create({ storageLocation: 'memory' });
      await PublicIPFS.create({ storageLocation: '/tmp/test' });

      expect(mockCreateHelia).toHaveBeenCalledTimes(2);
    });

    it('should log the peer id on creation', async () => {
      const Kernel = (await import('@haskou/ddd-kernel')).default;

      await PublicIPFS.create({ storageLocation: 'memory' });

      expect(Kernel.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('mock-peer-id'),
      );
    });
  });

  describe('stat', () => {
    it('should resolve when block exists locally in offline mode', async () => {
      const connection = await PublicIPFS.create({ storageLocation: 'memory' });
      const cid = new IPFSId('bafymockcid');

      mockHeliaNode.blockstore.has.mockResolvedValue(true);

      await expect(connection.stat(cid, true)).resolves.toBeUndefined();
      expect(mockHeliaNode.blockstore.has).toHaveBeenCalled();
    });

    it('should throw IPFSBlockNotFoundOfflineError when block does not exist locally', async () => {
      const connection = await PublicIPFS.create({ storageLocation: 'memory' });
      const cid = new IPFSId('bafymockcid');

      mockHeliaNode.blockstore.has.mockResolvedValue(false);

      await expect(connection.stat(cid, true)).rejects.toThrow(
        IPFSBlockNotFoundOfflineError,
      );
    });

    it('should resolve in online mode when block can be fetched', async () => {
      const connection = await PublicIPFS.create({ storageLocation: 'memory' });
      const cid = new IPFSId('bafymockcid');

      mockHeliaNode.blockstore.get.mockResolvedValue(new Uint8Array());

      await expect(connection.stat(cid, false)).resolves.toBeUndefined();
      expect(mockHeliaNode.blockstore.get).toHaveBeenCalled();
    });

    it('should throw IPFSBlockNotFoundPublicError when block cannot be fetched', async () => {
      const connection = await PublicIPFS.create({ storageLocation: 'memory' });
      const cid = new IPFSId('bafymockcid');

      mockHeliaNode.blockstore.get.mockRejectedValue(
        new Error('block not available'),
      );

      await expect(connection.stat(cid, false)).rejects.toThrow(
        IPFSBlockNotFoundPublicError,
      );
    });
  });

  describe('getJSON', () => {
    it('should not retain or advertise content that is only read', async () => {
      const connection = await PublicIPFS.create({ storageLocation: 'memory' });
      const cid = new IPFSId('bafymockcid');

      const result = await connection.getJSON(cid);
      await flushPromises();

      expect(result).toEqual({ test: true });
      expect(mockHeliaNode.pins.add).not.toHaveBeenCalled();
      expect(mockHeliaNode.routing.provide).not.toHaveBeenCalled();
    });
  });

  describe('addJSON', () => {
    it('should retain content created by this node', async () => {
      const connection = await PublicIPFS.create({ storageLocation: 'memory' });

      await connection.addJSON({ test: true });
      await flushPromises();

      expect(mockHeliaNode.pins.add).toHaveBeenCalledWith(
        expect.objectContaining({ toString: expect.any(Function) }),
        {
          metadata: {
            strategy: 'retained-content',
          },
          signal: undefined,
        },
      );
    });
  });

  describe('getBytes', () => {
    it('should read raw CIDs from connected peers when available', async () => {
      const connection = await PublicIPFS.create({ storageLocation: 'memory' });
      const parsedCid = { code: 0x55, toString: () => 'bafkrawcid' };
      const signal = new AbortController().signal;

      mockParseCid.mockReturnValue(parsedCid);
      const connectedPeer = {
        toCID: jest.fn().mockReturnValue('connected-peer-cid'),
      };
      mockHeliaNode.libp2p.getPeers.mockReturnValue([connectedPeer]);
      mockHeliaNode.blockstore.get.mockResolvedValue(new Uint8Array([1, 2, 3]));

      const result = await connection.getBytes(
        new IPFSId('bafkrawcid'),
        signal,
      );

      expect(result).toEqual(Buffer.from([1, 2, 3]));
      expect(mockHeliaNode.blockstore.get).toHaveBeenCalledWith(parsedCid, {
        maxProviders: 1,
        minProviders: 1,
        providers: ['connected-peer-cid'],
        signal,
      });
      expect(mockHeliaNode.pins.add).not.toHaveBeenCalled();
      expect(mockHeliaNode.routing.provide).not.toHaveBeenCalled();
    });
  });

  describe('provideContent', () => {
    it('should retain content before advertising it', async () => {
      const connection = await PublicIPFS.create({ storageLocation: 'memory' });

      mockHeliaNode.libp2p.getPeers.mockReturnValue(['peer-id']);
      mockHeliaNode.routing.provide.mockResolvedValue(undefined);

      await connection.provideContent(new IPFSId('bafymockcid'));

      expect(mockHeliaNode.pins.add).toHaveBeenCalledWith(
        expect.objectContaining({ toString: expect.any(Function) }),
        {
          metadata: {
            strategy: 'retained-content',
          },
          signal: undefined,
        },
      );
      expect(mockHeliaNode.pins.add.mock.invocationCallOrder[0]).toBeLessThan(
        mockHeliaNode.routing.provide.mock.invocationCallOrder[0],
      );
    });

    it('should fail instead of advertising content that cannot be retained', async () => {
      const connection = await PublicIPFS.create({ storageLocation: 'memory' });

      mockHeliaNode.libp2p.getPeers.mockReturnValue(['peer-id']);
      mockHeliaNode.pins.add.mockImplementation(() => {
        throw new Error('pin failed');
      });

      await expect(
        connection.provideContent(new IPFSId('bafymockcid')),
      ).rejects.toThrow('pin failed');
      expect(mockHeliaNode.routing.provide).not.toHaveBeenCalled();
    });

    it('should defer provider publication when there are no connected peers', async () => {
      const connection = await PublicIPFS.create({ storageLocation: 'memory' });

      await expect(
        connection.provideContent(new IPFSId('bafymockcid')),
      ).rejects.toThrow('No IPFS peers available for provider publication.');

      expect(mockHeliaNode.routing.provide).not.toHaveBeenCalled();
    });

    it('should publish deferred provider records when a peer connects', async () => {
      const connection = await PublicIPFS.create({ storageLocation: 'memory' });

      await expect(
        connection.provideContent(new IPFSId('bafymockcid')),
      ).rejects.toThrow('No IPFS peers available for provider publication.');
      await expect(
        connection.provideContent(new IPFSId('bafymockcid')),
      ).rejects.toThrow('No IPFS peers available for provider publication.');
      mockHeliaNode.libp2p.getPeers.mockReturnValue(['peer-id']);
      mockHeliaNode.routing.provide.mockResolvedValue(undefined);

      emitPeerConnect();
      await flushPromises();

      expect(mockHeliaNode.routing.provide).toHaveBeenCalledTimes(1);
      expect(mockHeliaNode.routing.provide).toHaveBeenCalledWith(
        expect.objectContaining({ toString: expect.any(Function) }),
        { signal: expect.any(AbortSignal) },
      );
    });

    it('should fail and queue a retry when provider publication fails', async () => {
      const connection = await PublicIPFS.create({ storageLocation: 'memory' });

      mockHeliaNode.libp2p.getPeers.mockReturnValue(['peer-id']);
      mockHeliaNode.routing.provide.mockRejectedValueOnce(
        new Error('routing timeout'),
      );

      await expect(
        connection.provideContent(new IPFSId('bafymockcid')),
      ).rejects.toThrow('routing timeout');

      mockHeliaNode.routing.provide.mockResolvedValue(undefined);
      emitPeerConnect();
      await flushPromises();

      expect(mockHeliaNode.routing.provide).toHaveBeenCalledTimes(2);
    });

    it('should publish content provider records when peers are connected', async () => {
      const connection = await PublicIPFS.create({ storageLocation: 'memory' });

      mockHeliaNode.libp2p.getPeers.mockReturnValue(['peer-id']);
      mockHeliaNode.routing.provide.mockResolvedValue(undefined);

      await connection.provideContent(new IPFSId('bafymockcid'));

      expect(mockHeliaNode.routing.provide).toHaveBeenCalledWith(
        expect.objectContaining({ toString: expect.any(Function) }),
        { signal: expect.any(AbortSignal) },
      );
    });
  });

  describe('removeJSON', () => {
    it('should unpin pinned content before deleting UnixFS DAG blocks', async () => {
      const connection = await PublicIPFS.create({ storageLocation: 'memory' });
      const cid = new IPFSId('bafymockcid');
      const childCid = { code: 0x55, toString: () => 'bafkchildcid' };

      mockHeliaNode.blockstore.has.mockResolvedValue(true);
      mockHeliaNode.blockstore.get.mockResolvedValue(new Uint8Array([1, 2, 3]));
      mockHeliaNode.pins.isPinned.mockResolvedValue(true);
      mockDagPbDecode.mockReturnValue({ Links: [{ Hash: childCid }] });

      await connection.removeJSON(cid);

      expect(mockHeliaNode.pins.rm).toHaveBeenCalled();
      expect(mockUnixfsRm).not.toHaveBeenCalled();
      expect(mockDagPbDecode).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
      expect(mockHeliaNode.blockstore.delete).toHaveBeenNthCalledWith(
        1,
        childCid,
        { signal: undefined },
      );
      expect(mockHeliaNode.blockstore.delete).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ toString: expect.any(Function) }),
        { signal: undefined },
      );
    });
  });

  describe('records', () => {
    it('should return local record before trying routing', async () => {
      const connection = await PublicIPFS.create({ storageLocation: 'memory' });

      mockHeliaNode.libp2p.getPeers.mockReturnValue(['peer-id']);
      mockHeliaNode.datastore.get.mockResolvedValue(
        new TextEncoder().encode('local-cid'),
      );

      const result = await connection.getRecord('identity-id');

      expect(result).toBe('local-cid');
      expect(mockHeliaNode.routing.get).not.toHaveBeenCalled();
    });

    it('should keep local record when routing publication fails', async () => {
      const Kernel = (await import('@haskou/ddd-kernel')).default;
      const connection = await PublicIPFS.create({ storageLocation: 'memory' });

      mockHeliaNode.libp2p.getPeers.mockReturnValue(['peer-id']);
      mockHeliaNode.datastore.put.mockResolvedValue(undefined);
      mockHeliaNode.routing.put.mockRejectedValue(new Error('dht timeout'));

      await expect(
        connection.putRecord('identity-id', 'local-cid'),
      ).resolves.toBeUndefined();

      expect(mockHeliaNode.datastore.put).toHaveBeenCalled();
      expect(mockHeliaNode.routing.put).toHaveBeenCalled();
      expect(Kernel.logger.debug).toHaveBeenCalledWith(
        'DHT record publication skipped for key: identity-id',
      );
    });
  });
});
