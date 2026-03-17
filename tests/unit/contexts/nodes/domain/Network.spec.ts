import { generateKeyPairSync } from 'crypto';

import { Network } from '../../../../../src/contexts/nodes/domain/Network';
import { NetworkKey } from '../../../../../src/contexts/nodes/domain/value-objects/NetworkKey';
import { NetworkName } from '../../../../../src/contexts/nodes/domain/value-objects/NetworkName';
import { NetworkId } from '../../../../../src/contexts/shared/domain/value-objects/NetworkId';

describe('Network', () => {
  const { privateKey } = generateKeyPairSync('ed25519');
  const validPem = privateKey
    .export({ format: 'pem', type: 'pkcs8' })
    .toString();

  describe('isPublic', () => {
    it('should return true when there is no key', () => {
      // Arrange
      const network = new Network(
        new NetworkId('550e8400-e29b-41d4-a716-446655440000'),
        new NetworkName('public'),
      );

      // Act & Assert
      expect(network.isPublic()).toBe(true);
    });

    it('should return false when there is a key', () => {
      // Arrange
      const network = new Network(
        new NetworkId('550e8400-e29b-41d4-a716-446655440001'),
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
        id: '550e8400-e29b-41d4-a716-446655440000',
        key: undefined,
        name: 'public',
      });

      // Assert
      expect(network.isPublic()).toBe(true);
      expect(network.getName().valueOf()).toBe('public');
      expect(network.getId().valueOf()).toBe(
        '550e8400-e29b-41d4-a716-446655440000',
      );
    });

    it('should create a private network with key', () => {
      // Arrange & Act
      const network = Network.fromPrimitives({
        id: '550e8400-e29b-41d4-a716-446655440001',
        key: validPem,
        name: 'private_0',
      });

      // Assert
      expect(network.isPublic()).toBe(false);
      expect(network.getName().valueOf()).toBe('private_0');
      expect(network.getId().valueOf()).toBe(
        '550e8400-e29b-41d4-a716-446655440001',
      );
    });
  });

  describe('toPrimitives', () => {
    it('should return undefined key for a public network', () => {
      // Arrange
      const network = new Network(
        new NetworkId('550e8400-e29b-41d4-a716-446655440000'),
        new NetworkName('public'),
      );

      // Act & Assert
      expect(network.toPrimitives()).toEqual({
        id: '550e8400-e29b-41d4-a716-446655440000',
        key: undefined,
        name: 'public',
      });
    });

    it('should return key for a private network', () => {
      // Arrange
      const network = new Network(
        new NetworkId('550e8400-e29b-41d4-a716-446655440001'),
        new NetworkName('private_0'),
        new NetworkKey(validPem),
      );

      // Act & Assert
      expect(network.toPrimitives()).toEqual({
        id: '550e8400-e29b-41d4-a716-446655440001',
        key: validPem,
        name: 'private_0',
      });
    });
  });
});
