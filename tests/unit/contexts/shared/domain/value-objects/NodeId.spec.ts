import { InvalidNodeIdError } from '@app/contexts/shared/domain/errors/InvalidNodeIdError';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';

describe('NodeId', () => {
  describe('constructor', () => {
    it('should create a node id from valid peer id format', () => {
      const value = `12D3Koo${'A'.repeat(35)}`;

      const nodeId = new NodeId(value);

      expect(nodeId.valueOf()).toBe(value);
    });

    it('should throw when value does not match peer id format', () => {
      expect(() => new NodeId('invalid-id')).toThrow(InvalidNodeIdError);
    });
  });
});
