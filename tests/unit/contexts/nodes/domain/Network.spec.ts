import { generateKeyPairSync } from 'crypto';

import { Network } from '../../../../../src/contexts/nodes/domain/Network';
import { NetworkKey } from '../../../../../src/contexts/nodes/domain/value-objects/NetworkKey';
import { NetworkName } from '../../../../../src/contexts/nodes/domain/value-objects/NetworkName';

describe('Network', () => {
  const { privateKey } = generateKeyPairSync('ed25519');
  const validPem = privateKey
    .export({ format: 'pem', type: 'pkcs8' })
    .toString();

  describe('isPublic', () => {
    it('should return true when there is no key', () => {
      // Arrange
      const network = new Network(new NetworkName('public'));

      // Act & Assert
      expect(network.isPublic()).toBe(true);
    });

    it('should return false when there is a key', () => {
      // Arrange
      const network = new Network(
        new NetworkName('private_0'),
        new NetworkKey(validPem),
      );

      // Act & Assert
      expect(network.isPublic()).toBe(false);
    });
  });

  describe('fromPrimitives', () => {
    it('should create a public network without key', () => {
      // Arrange & Act
      const network = Network.fromPrimitives({
        key: undefined,
        name: 'public',
      });

      // Assert
      expect(network.isPublic()).toBe(true);
      expect(network.getName().valueOf()).toBe('public');
    });

    it('should create a private network with key', () => {
      // Arrange & Act
      const network = Network.fromPrimitives({
        key: validPem,
        name: 'private_0',
      });

      // Assert
      expect(network.isPublic()).toBe(false);
      expect(network.getName().valueOf()).toBe('private_0');
    });
  });

  describe('toPrimitives', () => {
    it('should return undefined key for a public network', () => {
      // Arrange
      const network = new Network(new NetworkName('public'));

      // Act & Assert
      expect(network.toPrimitives()).toEqual({
        key: undefined,
        name: 'public',
      });
    });

    it('should return key for a private network', () => {
      // Arrange
      const network = new Network(
        new NetworkName('private_0'),
        new NetworkKey(validPem),
      );

      // Act & Assert
      expect(network.toPrimitives()).toEqual({
        key: validPem,
        name: 'private_0',
      });
    });
  });
});
