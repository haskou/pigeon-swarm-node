import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { faker } from '@faker-js/faker';

describe('NodeId', () => {
  describe('constructor', () => {
    it('should create a node id from valid uuid format', () => {
      const value = faker.string.uuid();

      const nodeId = new NodeId(value);

      expect(nodeId.valueOf()).toBe(value);
    });

    it('should throw when value does not match uuid format', () => {
      expect(() => new NodeId('invalid-id')).toThrow();
    });
  });
});
