import { Password } from '../../../../../../src/contexts/shared/domain/value-objects/Password';
import { IPFSNetworkConfig } from '../../../../../../src/contexts/shared/infrastructure/ipfs/IPFSNetworkConfig';

describe('IPFSNetworkConfig', () => {
  describe('fromPrimitives', () => {
    it('should create a private config when key is provided', () => {
      const config = IPFSNetworkConfig.fromPrimitives({
        key: 'my-secret-key-12345',
        name: 'my-network',
      });

      expect(config.getName()).toBe('my-network');
      expect(config.isPrivate()).toBe(true);
      expect(config.getKey()).toBeInstanceOf(Password);
    });

    it('should create a public config when key is undefined', () => {
      const config = IPFSNetworkConfig.fromPrimitives({
        key: undefined,
        name: 'public-net',
      });

      expect(config.getName()).toBe('public-net');
      expect(config.isPrivate()).toBe(false);
      expect(config.getKey()).toBeUndefined();
    });
  });

  describe('toPrimitives', () => {
    it('should return correct primitives for a private config', () => {
      const config = new IPFSNetworkConfig(
        'test-net',
        new Password('secret-key-12345'),
      );

      const primitives = config.toPrimitives();

      expect(primitives.name).toBe('test-net');
      expect(primitives.key).toBe('secret-key-12345');
    });

    it('should return undefined key for a public config', () => {
      const config = new IPFSNetworkConfig('public');

      const primitives = config.toPrimitives();

      expect(primitives.name).toBe('public');
      expect(primitives.key).toBeUndefined();
    });
  });
});
