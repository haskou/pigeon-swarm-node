import { InvalidMasterKeyDerivationError } from '@app/contexts/identities/domain/errors/InvalidMasterKeyDerivationError';
import { MasterKeyDerivation } from '@app/contexts/identities/domain/value-objects/MasterKeyDerivation';

describe(MasterKeyDerivation.name, () => {
  it('preserves stored derivation parameters and isolates them from mutation', () => {
    const parameters = {
      algorithm: 'scrypt',
      parameters: { N: 16384, r: 8, p: 5 },
      salt: 'stored-salt',
    };
    const derivation = MasterKeyDerivation.fromPrimitives(parameters);
    const expected = JSON.parse(JSON.stringify(parameters));
    parameters.parameters.N = 2;
    const serialized = derivation.toPrimitives();
    serialized.parameters = null;
    expect(derivation.toPrimitives()).toEqual(expected);
  });

  it.each([{}, { padding: 'x'.repeat(16384) }, { value: BigInt(1) }])(
    'rejects invalid stored parameters',
    (parameters) => {
      expect(() => MasterKeyDerivation.fromPrimitives(parameters)).toThrow(
        InvalidMasterKeyDerivationError,
      );
    },
  );

  it('rejects circular parameters', () => {
    const parameters: Record<string, unknown> = { algorithm: 'scrypt' };
    parameters.self = parameters;
    expect(() => MasterKeyDerivation.fromPrimitives(parameters)).toThrow(
      InvalidMasterKeyDerivationError,
    );
  });
});
