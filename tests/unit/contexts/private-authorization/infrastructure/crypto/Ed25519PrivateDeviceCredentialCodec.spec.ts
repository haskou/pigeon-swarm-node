import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { PrivateAuthorizationDeviceKey } from '@app/contexts/private-authorization/domain/value-objects/PrivateAuthorizationDeviceKey';
import Ed25519PrivateDeviceCredentialCodec from '@app/contexts/private-authorization/infrastructure/crypto/Ed25519PrivateDeviceCredentialCodec';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';

describe(Ed25519PrivateDeviceCredentialCodec.name, () => {
  const codec = new Ed25519PrivateDeviceCredentialCodec();

  it('round trips an independent Ed25519 device credential', async () => {
    const keyPair = await KeyPair.generate();
    const credential = DeviceCredential.fromString(
      keyPair.toPrimitives().publicKey,
    );
    const deviceKey = codec.toDeviceKey(credential);

    expect(codec.toCredential(deviceKey).isEqual(credential)).toBe(true);
  });

  it('rejects a non-Ed25519 credential encoding', () => {
    expect(() =>
      codec.toCredential(new PrivateAuthorizationDeviceKey('invalid')),
    ).toThrow();
  });
});
