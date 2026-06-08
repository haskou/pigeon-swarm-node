jest.mock(
  '../../../../../../../src/contexts/shared/infrastructure/ipfs/helia/adapters/HeliaRuntimeAdapter',
  () => ({
    __esModule: true,
    default: {
      createMemoryBlockstore: jest.fn(async () => ({})),
      createMemoryDatastore: jest.fn(async () => ({})),
      getLibp2pDefaults: jest.fn(async () => ({
        addresses: {},
        connectionEncrypters: [] as unknown[],
        services: {},
        streamMuxers: [] as unknown[],
        transports: [] as unknown[],
      })),
    },
  }),
);

import { HeliaIPFSParser } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/helia/HeliaIPFSParser';
import { Libp2pPrivateKeyLike } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';

describe('HeliaIPFSParser', () => {
  const originalEnvironment = process.env;

  beforeEach(() => {
    process.env = { ...originalEnvironment };
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  describe('isInMemoryStorageLocation', () => {
    it('should return true when storage location is memory', () => {
      const result = HeliaIPFSParser.isInMemoryStorageLocation('memory');

      expect(result).toBe(true);
    });

    it('should return true when storage location starts with memory/', () => {
      const result =
        HeliaIPFSParser.isInMemoryStorageLocation('memory/custom-path');

      expect(result).toBe(true);
    });

    it('should return false for filesystem storage paths', () => {
      const result = HeliaIPFSParser.isInMemoryStorageLocation('/tmp/ipfs');

      expect(result).toBe(false);
    });
  });

  describe('parseOptions', () => {
    it('should announce the public relay address for provider records when relay is enabled', async () => {
      process.env.PIGEON_RELAY_ENABLED = 'true';
      process.env.PIGEON_PUBLIC_HOST = 'relay.example.com';
      process.env.PIGEON_RELAY_PORT = '4011';
      const privateKey = {
        publicKey: {
          toString: () => '12D3RelayPeer',
        },
      } as Libp2pPrivateKeyLike;

      const parsedOptions = await HeliaIPFSParser.parseOptions({
        privateKey,
        storageLocation: 'memory',
      });
      const libp2pConfig = parsedOptions.libp2p as {
        addresses?: { announce?: string[] };
      };

      expect(libp2pConfig.addresses?.announce).toEqual([
        '/dns4/relay.example.com/tcp/4011/p2p/12D3RelayPeer',
      ]);
    });
  });
});
