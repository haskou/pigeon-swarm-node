import { CompositeOrbitDBMutationGate } from '@app/contexts/shared/infrastructure/orbitdb/CompositeOrbitDBMutationGate';
import { OrbitDBMutationGate } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBMutationGate';
import { mock } from 'jest-mock-extended';

function gate(
  collection: string,
  headPrefix: string,
  accepted: boolean,
): OrbitDBMutationGate {
  const stub = mock<OrbitDBMutationGate>();

  stub.governs.mockImplementation((value) => value === collection);
  stub.accepts.mockResolvedValue(accepted);
  stub.governsHead.mockImplementation((key) => key.startsWith(headPrefix));
  stub.acceptsHead.mockResolvedValue(accepted);

  return stub;
}

describe('CompositeOrbitDBMutationGate', () => {
  it('should govern what any gate governs', () => {
    const composite = new CompositeOrbitDBMutationGate([
      gate('pins', 'pins-head', true),
      gate('keychains', 'keychain:', true),
    ]);

    expect(composite.governs('pins')).toBe(true);
    expect(composite.governs('keychains')).toBe(true);
    expect(composite.governs('calls')).toBe(false);
    expect(composite.governsHead('keychain:a')).toBe(true);
    expect(composite.governsHead('calls:a')).toBe(false);
  });

  it('should consult only the gates governing the collection', async () => {
    const pins = gate('pins', 'pins-head', false);
    const keychains = gate('keychains', 'keychain:', true);
    const composite = new CompositeOrbitDBMutationGate([pins, keychains]);

    await expect(composite.accepts('keychains', {})).resolves.toBe(true);
    expect(pins.accepts).not.toHaveBeenCalled();
    await expect(composite.accepts('pins', {})).resolves.toBe(false);
    await expect(composite.accepts('calls', {})).resolves.toBe(true);
  });

  it('should reject a head when any governing gate rejects it', async () => {
    const pins = gate('pins', 'pins-head', true);
    const keychains = gate('keychains', 'keychain:', false);
    const composite = new CompositeOrbitDBMutationGate([pins, keychains]);

    await expect(composite.acceptsHead('keychain:a', {})).resolves.toBe(false);
    await expect(composite.acceptsHead('pins-head:a', {})).resolves.toBe(true);
    expect(pins.acceptsHead).toHaveBeenCalledTimes(1);
    await expect(composite.acceptsHead('calls:a', {})).resolves.toBe(true);
  });
});
