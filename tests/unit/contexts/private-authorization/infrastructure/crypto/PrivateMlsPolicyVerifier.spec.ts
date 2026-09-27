import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import PrivateMlsPolicyVerifier from '@app/contexts/private-authorization/infrastructure/crypto/PrivateMlsPolicyVerifier';

describe('PrivateMlsPolicyVerifier', () => {
  const verifier = new PrivateMlsPolicyVerifier();
  const devices = [
    { deviceKey: 'device-a', mlsCredentialHash: 'credential-a' },
    { deviceKey: 'device-b', mlsCredentialHash: 'credential-b' },
  ];

  it('accepts the complete MLS leaf-policy set independent of input order', () => {
    expect(() => verifier.verify([...devices].reverse(), devices)).not.toThrow();
  });

  it.each([
    ['missing leaf', devices.slice(0, 1), devices],
    [
      'changed credential',
      [{ deviceKey: 'device-a', mlsCredentialHash: 'other' }, devices[1]],
      devices,
    ],
    ['extra leaf', [...devices, { deviceKey: 'device-c', mlsCredentialHash: 'credential-c' }], devices],
    ['duplicate candidate', [devices[0], devices[0]], devices],
    ['duplicate policy', devices, [devices[0], devices[0]]],
  ])('rejects %s', (_label, candidate, policy) => {
    expect(() => verifier.verify(candidate, policy)).toThrow(
      InvalidPrivateAuthorizationError,
    );
  });
});
