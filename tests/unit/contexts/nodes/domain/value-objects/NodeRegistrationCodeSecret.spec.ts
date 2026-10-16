import { NodeRegistrationCodeIsNotValidError } from '@app/contexts/nodes/domain/errors/NodeRegistrationCodeIsNotValidError';
import { NodeRegistrationCodeSecret } from '@app/contexts/nodes/domain/value-objects/NodeRegistrationCodeSecret';

import { cryptoVectors } from '../../../../../support/cryptoVectors';

interface Vectors {
  hash: {
    invalid: { name: string; token: string }[];
    valid: { hash: string; name: string; token: string }[];
  };
}

const vectors = cryptoVectors<Vectors>('bearer-capabilities');

describe('NodeRegistrationCodeSecret', () => {
  it('should generate 32 random bytes encoded as base64url', () => {
    const secret = NodeRegistrationCodeSecret.generate().valueOf();

    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(secret, 'base64url')).toHaveLength(32);
    expect(NodeRegistrationCodeSecret.generate().valueOf()).not.toBe(secret);
  });

  it.each(vectors.hash.valid)(
    'should commit to the $name code',
    ({ hash, token }) => {
      expect(new NodeRegistrationCodeSecret(token).hash().valueOf()).toBe(hash);
    },
  );

  it.each(vectors.hash.invalid)(
    'should reject a code with $name',
    ({ token }) => {
      expect(() => new NodeRegistrationCodeSecret(token).hash()).toThrow(
        NodeRegistrationCodeIsNotValidError,
      );
    },
  );
});
