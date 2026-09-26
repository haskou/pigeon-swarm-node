import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import LegacyIdentityDeviceBinding from '@app/contexts/private-authorization/infrastructure/crypto/LegacyIdentityDeviceBinding';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { createPublicKey, generateKeyPairSync } from 'crypto';

describe('LegacyIdentityDeviceBinding', () => {
  const binding = new LegacyIdentityDeviceBinding();

  it('extracts the exact raw Ed25519 key from the independently supplied SPKI', async () => {
    const pair = await KeyPair.generate();
    const publicKey = pair.toPrimitives().publicKey;
    const spki = publicKey
      .replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, '');
    const jwk = createPublicKey(publicKey).export({ format: 'jwk' });

    expect(binding.bind(spki)).toBe(jwk.x);
  });

  it.each([
    ['malformed DER', Buffer.alloc(44, 7).toString('base64')],
    [
      'non-Ed25519 SPKI',
      generateKeyPairSync('ec', { namedCurve: 'P-256' })
        .publicKey.export({ format: 'der', type: 'spki' })
        .toString('base64'),
    ],
    ['non-canonical base64', `${Buffer.alloc(44).toString('base64')}=`],
  ])('rejects %s with one redacted domain error', (_label, spki) => {
    expect(() => binding.bind(spki)).toThrow(InvalidPrivateAuthorizationError);

    try {
      binding.bind(spki);
    } catch (error) {
      expect(String(error)).toBe('InvalidPrivateAuthorizationError: Invalid private authorization');
      expect(String(error)).not.toContain(spki);
    }
  });
});
