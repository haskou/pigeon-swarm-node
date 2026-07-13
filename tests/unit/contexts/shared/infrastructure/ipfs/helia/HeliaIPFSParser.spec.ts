import { HeliaIPFSParser } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/helia/HeliaIPFSParser';
import { heliaRuntimeAdapter } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/helia/adapters/HeliaRuntimeAdapter';

describe('HeliaIPFSParser', () => {
  afterEach(() => {
    jest.restoreAllMocks();
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

  it('should propagate isolated local routing options', async () => {
    const defaults = jest
      .spyOn(heliaRuntimeAdapter, 'getLibp2pDefaults')
      .mockResolvedValue({} as never);
    jest
      .spyOn(heliaRuntimeAdapter, 'createMemoryBlockstore')
      .mockResolvedValue({} as never);
    jest
      .spyOn(heliaRuntimeAdapter, 'createMemoryDatastore')
      .mockResolvedValue({} as never);

    await HeliaIPFSParser.parseOptions({
      distributedHashTableServerEnabled: true,
      localAddressRoutingEnabled: true,
      localPeerDiscoveryEnabled: false,
      storageLocation: 'memory/isolated-public-routing',
    });

    expect(defaults).toHaveBeenCalledWith(
      expect.objectContaining({
        distributedHashTableServerEnabled: true,
        localAddressRoutingEnabled: true,
        localPeerDiscoveryEnabled: false,
      }),
    );
  });
});
