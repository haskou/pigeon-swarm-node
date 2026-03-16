import { PrivateKey } from '@haskou/value-objects';
import { generateKeyPairSync } from 'crypto';

import { IPFSNetworkConfig } from '../../../../../../src/contexts/shared/infrastructure/ipfs/IPFSNetworkConfig';

describe('IPFSNetworkConfig', () => {
  const { privateKey } = generateKeyPairSync('ed25519');
  const validPem = privateKey
    .export({ format: 'pem', type: 'pkcs8' })
    .toString();

  describe('fromPrimitives', () => {
    it('should create a private config when key is provided', () => {
      const config = IPFSNetworkConfig.fromPrimitives({
        key: validPem,
        name: 'my-network',
      });

      expect(config.getName()).toBe('my-network');
      expect(config.isPrivate()).toBe(true);
      expect(config.getKey()).toBeInstanceOf(PrivateKey);
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
        new PrivateKey(validPem),
      );

      const primitives = config.toPrimitives();

      expect(primitives.name).toBe('test-net');
      expect(primitives.key).toBe(validPem);
    });

    it('should return undefined key for a public config', () => {
      const config = new IPFSNetworkConfig('public');

      const primitives = config.toPrimitives();

      expect(primitives.name).toBe('public');
      expect(primitives.key).toBeUndefined();
    });
  });
});
