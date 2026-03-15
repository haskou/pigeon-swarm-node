const mockHeliaNode = {
  libp2p: {
    peerId: { toString: () => 'mock-peer-id' },
    getPeers: jest.fn().mockReturnValue([]),
  },
  datastore: { put: jest.fn(), get: jest.fn() },
  routing: { put: jest.fn(), get: jest.fn() },
};

const mockCreateHelia = jest.fn().mockResolvedValue(mockHeliaNode);
const mockPreSharedKey = jest.fn().mockReturnValue('mock-connection-protector');

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
  'interface-datastore',
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
    logger: { info: jest.fn(), error: jest.fn() },
  },
}));

import { Password } from '../../../../../../src/contexts/shared/domain/value-objects/Password';
import {
  PrivateIPFS,
  PrivateIPFSOptions,
} from '../../../../../../src/contexts/shared/infrastructure/ipfs/PrivateIPFS';

describe('PrivateIPFS', () => {
  const defaultOptions: PrivateIPFSOptions = {
    storageLocation: 'memory',
    key: new Password('my-secret-key-12345'),
    name: 'test-network',
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

      expect(mockPreSharedKey).toHaveBeenCalledWith({
        psk: Uint8Array.from(defaultOptions.key.valueOf()),
      });
    });

    it('should pass connectionProtector to createHelia', async () => {
      await PrivateIPFS.create(defaultOptions);

      expect(mockCreateHelia).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionProtector: 'mock-connection-protector',
        }),
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
  });
});
