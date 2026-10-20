import { CompositeOrbitDBMutationGate } from '@app/contexts/shared/infrastructure/orbitdb/CompositeOrbitDBMutationGate';
import {
  OrbitDBMutationGate,
  OrbitDBMutationVerdict,
} from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBMutationGate';
import { mock } from 'jest-mock-extended';

function gate(
  collection: string,
  headPrefix: string,
  verdict: OrbitDBMutationVerdict,
): OrbitDBMutationGate {
  const stub = mock<OrbitDBMutationGate>();

  stub.governs.mockImplementation((value) => value === collection);
  stub.verdictOf.mockResolvedValue(verdict);
  stub.governsHead.mockImplementation((key) => key.startsWith(headPrefix));
  stub.acceptsHead.mockResolvedValue(verdict === 'accepted');

  return stub;
}

describe('CompositeOrbitDBMutationGate', () => {
  it('should govern what any gate governs', () => {
    const composite = new CompositeOrbitDBMutationGate([
      gate('pins', 'pins-head', 'accepted'),
      gate('keychains', 'keychain:', 'accepted'),
    ]);

    expect(composite.governs('pins')).toBe(true);
    expect(composite.governs('keychains')).toBe(true);
    expect(composite.governs('calls')).toBe(false);
    expect(composite.governsHead('keychain:a')).toBe(true);
    expect(composite.governsHead('calls:a')).toBe(false);
  });

  it('should consult only the gates governing the collection', async () => {
    const pins = gate('pins', 'pins-head', 'pending');
    const keychains = gate('keychains', 'keychain:', 'accepted');
    const composite = new CompositeOrbitDBMutationGate([pins, keychains]);

    await expect(composite.verdictOf('keychains', {})).resolves.toBe(
      'accepted',
    );
    expect(pins.verdictOf).not.toHaveBeenCalled();
    await expect(composite.accepts('pins', {})).resolves.toBe(false);
    await expect(composite.accepts('calls', {})).resolves.toBe(true);
  });

  it('should refuse a record a governing gate refuses, even when another gate holds it', async () => {
    const composite = new CompositeOrbitDBMutationGate([
      gate('pins', 'pins-head', 'pending'),
      gate('pins', 'pins-head', 'refused'),
    ]);

    await expect(composite.verdictOf('pins', {})).resolves.toBe('refused');
  });

  it('should hold a record that no governing gate refuses while one still waits', async () => {
    const composite = new CompositeOrbitDBMutationGate([
      gate('pins', 'pins-head', 'accepted'),
      gate('pins', 'pins-head', 'pending'),
    ]);

    await expect(composite.verdictOf('pins', {})).resolves.toBe('pending');
  });

  it('should reject a head when any governing gate rejects it', async () => {
    const pins = gate('pins', 'pins-head', 'accepted');
    const keychains = gate('keychains', 'keychain:', 'refused');
    const composite = new CompositeOrbitDBMutationGate([pins, keychains]);

    await expect(composite.acceptsHead('keychain:a', {})).resolves.toBe(false);
    await expect(composite.acceptsHead('pins-head:a', {})).resolves.toBe(true);
    expect(pins.acceptsHead).toHaveBeenCalledTimes(1);
    await expect(composite.acceptsHead('calls:a', {})).resolves.toBe(true);
  });
});
