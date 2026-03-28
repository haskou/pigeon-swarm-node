import { HeliaIPFSParser } from '../../../../../../../src/contexts/shared/infrastructure/ipfs/helia/HeliaIPFSParser';

describe('HeliaIPFSParser', () => {
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
});
