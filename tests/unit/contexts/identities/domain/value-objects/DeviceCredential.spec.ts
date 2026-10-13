import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';

describe('DeviceCredential wire form', () => {
  it('round-trips the identity-id body without PEM headers', async () => {
    const { publicKey } = (await KeyPair.generate()).toPrimitives();
    const credential = DeviceCredential.fromString(publicKey);

    const wire = credential.toWire();

    expect(wire).toBe(new IdentityId(publicKey).valueOf());
    expect(wire).not.toContain('PUBLIC KEY');
    expect(DeviceCredential.fromWire(wire).toWire()).toBe(wire);
    expect(DeviceCredential.fromWire(wire).isEqual(credential)).toBe(true);
  });

  it('parses the wire form into the same credential as the identity-id bridge', async () => {
    const { publicKey } = (await KeyPair.generate()).toPrimitives();
    const wire = new IdentityId(publicKey).valueOf();

    expect(
      DeviceCredential.fromWire(wire).isEqual(
        DeviceCredential.fromIdentityId(new IdentityId(wire)),
      ),
    ).toBe(true);
  });
});
