import { InvalidNodeRelayPortError } from '@app/contexts/nodes/domain/errors/InvalidNodeRelayPortError';
import { NodeRelayPort } from '@app/contexts/nodes/domain/value-objects/NodeRelayPort';

describe('NodeRelayPort', () => {
  it('compares ports through numeric value object behavior', () => {
    expect(new NodeRelayPort(4001).isBefore(new NodeRelayPort(4002))).toBe(
      true,
    );
  });

  it.each([0, 65536])('rejects the out-of-range port %s', (port) => {
    expect(() => new NodeRelayPort(port)).toThrow(InvalidNodeRelayPortError);
  });
});
