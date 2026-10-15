import { NodeRegistrationMode } from '@app/contexts/nodes/domain/value-objects/NodeRegistrationMode';

describe('NodeRegistrationMode', () => {
  it.each(['open', 'codes', 'closed'])('should accept %s', (mode) => {
    expect(NodeRegistrationMode.fromPrimitives(mode).valueOf()).toBe(mode);
  });

  it('should reject an unknown mode', () => {
    expect(() => NodeRegistrationMode.fromPrimitives('invite')).toThrow();
  });

  it('should tell open and closed apart from codes', () => {
    expect(NodeRegistrationMode.OPEN.isOpen()).toBe(true);
    expect(NodeRegistrationMode.CLOSED.isClosed()).toBe(true);
    expect(NodeRegistrationMode.CODES.isOpen()).toBe(false);
    expect(NodeRegistrationMode.CODES.isClosed()).toBe(false);
  });
});
