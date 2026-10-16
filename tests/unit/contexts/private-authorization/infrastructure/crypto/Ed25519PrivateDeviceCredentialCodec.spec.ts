import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivateAuthorizationDeviceKey } from '@app/contexts/private-authorization/domain/value-objects/PrivateAuthorizationDeviceKey';
import Ed25519PrivateDeviceCredentialCodec from '@app/contexts/private-authorization/infrastructure/crypto/Ed25519PrivateDeviceCredentialCodec';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import vectors from '@haskou/pigeon-swarm-crypto/vectors/relay-records.json';

describe(Ed25519PrivateDeviceCredentialCodec.name, () => {
  const codec = new Ed25519PrivateDeviceCredentialCodec();
  const relay = vectors.keys.relay;
  const relayDeviceKey = Buffer.from(relay.publicKey, 'base64url')
    .subarray(4)
    .toString('base64url');

  it('round trips an independent Ed25519 device credential', async () => {
    const keyPair = await KeyPair.generate();
    const credential = DeviceCredential.fromString(
      keyPair.toPrimitives().publicKey,
    );
    const deviceKey = codec.toDeviceKey(credential);

    expect(codec.toCredential(deviceKey).isEqual(credential)).toBe(true);
  });

  it('maps the vector public key to its raw device key and back', () => {
    const credential = DeviceCredential.fromString(relay.publicKeyPem);

    expect(codec.toDeviceKey(credential).valueOf()).toBe(relayDeviceKey);
    expect(
      codec
        .toCredential(new PrivateAuthorizationDeviceKey(relayDeviceKey))
        .isEqual(credential),
    ).toBe(true);
  });

  it.each([
    ['a non-key encoding', 'invalid'],
    ['a padded encoding', `${relayDeviceKey}=`],
    ['a standard base64 encoding', Buffer.alloc(32, 0xfb).toString('base64')],
    ['a short key', relayDeviceKey.slice(0, 42)],
    ['the identity point', `AQ${'A'.repeat(41)}`],
  ])('rejects %s', (_name, deviceKey) => {
    expect(() =>
      codec.toCredential(new PrivateAuthorizationDeviceKey(deviceKey)),
    ).toThrow(InvalidPrivateAuthorizationError);
  });
});
