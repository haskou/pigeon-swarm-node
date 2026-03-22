const mockHeliaNode = {
  blockstore: {
    has: jest.fn(),
  },
  datastore: { get: jest.fn(), put: jest.fn() },
  libp2p: {
    getPeers: jest.fn().mockReturnValue([]),
    peerId: { toString: () => 'mock-peer-id' },
  },
  routing: { get: jest.fn(), put: jest.fn() },
};

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
    logger: { error: jest.fn(), info: jest.fn() },
  },
}));

import { PublicIPFS } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/networks/PublicIPFS';
import { IPFSId } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/helia/IPFSId';

describe('PublicIPFS', () => {
  beforeEach(() => {
    (
      PublicIPFS as unknown as { connectionPool: Record<string, unknown> }
    ).connectionPool = {};
    jest.clearAllMocks();
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
    it('should resolve when block exists', async () => {
      const connection = await PublicIPFS.create({ storageLocation: 'memory' });
      const cid = new IPFSId('bafymockcid');

      mockHeliaNode.blockstore.has.mockResolvedValue(true);

      await expect(connection.stat(cid, false)).resolves.toBeUndefined();
    });

    it('should throw when block does not exist', async () => {
      const connection = await PublicIPFS.create({ storageLocation: 'memory' });
      const cid = new IPFSId('bafymockcid');

      mockHeliaNode.blockstore.has.mockResolvedValue(false);

      await expect(connection.stat(cid, true)).rejects.toThrow(
        'Block not found (offline): bafymockcid',
      );
    });
  });
});
