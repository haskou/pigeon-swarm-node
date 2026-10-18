import { PostIdentityBody } from '@app/apps/apis/identities-api/bodies/PostIdentityBody';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

const baseIdentity = {
  authorizationRevision: 0,
  deviceCredential: 'device',
  deviceCredentialCommitment: 'commitment',
  id: 'identity',
  networks: ['550e8400-e29b-41d4-a716-446655440000'],
  profile: { name: 'John' },
  recoveryAuthority: 'recovery',
  signature: 'signature',
  timestamp: 1_780_000_000_000,
  version: 1,
};

const failingProperties = async (admissionNonce?: string): Promise<string[]> =>
  (
    await validate(
      plainToInstance(PostIdentityBody, { ...baseIdentity, admissionNonce }),
    )
  ).map((error) => error.property);

describe('PostIdentityBody admissionNonce', () => {
  it.each(['0', '1840333', '9'.repeat(16)])('accepts %s', async (nonce) => {
    expect(await failingProperties(nonce)).not.toContain('admissionNonce');
  });

  it('accepts an absent nonce', async () => {
    expect(await failingProperties(undefined)).not.toContain('admissionNonce');
  });

  it.each(['', '007', '-1', '1.5', 'a_b-c', '1e3', '9'.repeat(17)])(
    'rejects the non-canonical nonce %j',
    async (nonce) => {
      expect(await failingProperties(nonce)).toContain('admissionNonce');
    },
  );
});
