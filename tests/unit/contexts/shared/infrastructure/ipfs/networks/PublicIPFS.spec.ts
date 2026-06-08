const mockHeliaNode = {
  blockstore: {
    delete: jest.fn(),
    get: jest.fn(),
    has: jest.fn(),
  },
  datastore: { get: jest.fn(), put: jest.fn() },
  libp2p: {
    getPeers: jest.fn().mockReturnValue([]),
    peerId: { toString: () => 'mock-peer-id' },
  },
  pins: {
    add: jest.fn(),
    isPinned: jest.fn(),
    rm: jest.fn(),
  },
  routing: {
    findProviders: jest.fn(),
    get: jest.fn(),
    provide: jest.fn(),
    put: jest.fn(),
  },
};

async function* pinResults(cid: { toString(): string }) {
  yield cid;
}

const mockCreateHelia = jest.fn().mockResolvedValue(mockHeliaNode);
const mockCreateLibp2p = jest.fn().mockResolvedValue(mockHeliaNode.libp2p);
const mockPreSharedKey = jest.fn().mockReturnValue('mock-connection-protector');
const mockMultiaddr = jest
  .fn()
  .mockImplementation((address: string) => `mock-multiaddr:${address}`);

jest.mock(
  'helia',
  () => ({
    createHelia: mockCreateHelia,
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
  '@multiformats/multiaddr',
  () => ({
    multiaddr: mockMultiaddr,
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
      parse: jest.fn().mockReturnValue({ toString: () => 'bafymockcid' }),
    },
  }),
  { virtual: true },
);

jest.mock('@app/Kernel', () => ({
  __esModule: true,
  default: {
    logger: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
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
    jest.clearAllMocks();
    mockHeliaNode.libp2p.getPeers.mockReturnValue([]);
    mockHeliaNode.pins.add.mockReturnValue(
      pinResults({ toString: () => 'bafymockcid' }),
    );
    mockHeliaNode.pins.isPinned.mockResolvedValue(false);
    mockHeliaNode.pins.rm.mockReturnValue(
      pinResults({ toString: () => 'bafymockcid' }),
    );
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
      const Kernel = (await import('@app/Kernel')).default;

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
    it('should pin fetched JSON content for local availability', async () => {
      const connection = await PublicIPFS.create({ storageLocation: 'memory' });
      const cid = new IPFSId('bafymockcid');

      const result = await connection.getJSON(cid);

      expect(result).toEqual({ test: true });
      expect(mockHeliaNode.pins.add).toHaveBeenCalledWith(
        expect.objectContaining({ toString: expect.any(Function) }),
        {
          metadata: {
            strategy: 'read-through-cache',
          },
          signal: undefined,
        },
      );
    });
  });

  describe('removeJSON', () => {
    it('should unpin pinned content before deleting the block', async () => {
      const connection = await PublicIPFS.create({ storageLocation: 'memory' });
      const cid = new IPFSId('bafymockcid');

      mockHeliaNode.blockstore.has.mockResolvedValue(true);
      mockHeliaNode.pins.isPinned.mockResolvedValue(true);

      await connection.removeJSON(cid);

      expect(mockHeliaNode.pins.rm).toHaveBeenCalled();
      expect(mockHeliaNode.blockstore.delete).toHaveBeenCalled();
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
      jest.useFakeTimers();
      const Kernel = (await import('@app/Kernel')).default;
      const connection = await PublicIPFS.create({ storageLocation: 'memory' });

      mockHeliaNode.libp2p.getPeers.mockReturnValue(['peer-id']);
      mockHeliaNode.datastore.put.mockResolvedValue(undefined);
      mockHeliaNode.routing.put.mockRejectedValue(new Error('dht timeout'));

      await expect(
        connection.putRecord('identity-id', 'local-cid'),
      ).resolves.toBeUndefined();

      expect(mockHeliaNode.datastore.put).toHaveBeenCalled();
      expect(mockHeliaNode.routing.put).toHaveBeenCalled();
      jest.advanceTimersByTime(5000);
      expect(Kernel.logger.debug).toHaveBeenCalledWith(
        'DHT record publications skipped: count=1 sampleKey="identity-id"',
      );
      jest.useRealTimers();
    });
  });
});
