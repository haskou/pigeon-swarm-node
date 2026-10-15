import { NodeRegistrationCodeSecret } from '@app/contexts/nodes/domain/value-objects/NodeRegistrationCodeSecret';
import { createHash } from 'crypto';

describe('NodeRegistrationCodeSecret', () => {
  it('should generate 32 random bytes encoded as base64url', () => {
    const secret = NodeRegistrationCodeSecret.generate().valueOf();

    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(secret, 'base64url')).toHaveLength(32);
    expect(NodeRegistrationCodeSecret.generate().valueOf()).not.toBe(secret);
  });

  it('should hash the code with SHA-256', () => {
    const secret = new NodeRegistrationCodeSecret('a-code');

    expect(secret.hash().valueOf()).toBe(
      createHash('sha256').update('a-code').digest('hex'),
    );
  });
});
