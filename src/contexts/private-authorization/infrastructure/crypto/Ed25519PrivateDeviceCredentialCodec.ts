import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivateDeviceCredentialCodec } from '@app/contexts/private-authorization/domain/services/PrivateDeviceCredentialCodec';
import { PrivateAuthorizationDeviceKey } from '@app/contexts/private-authorization/domain/value-objects/PrivateAuthorizationDeviceKey';
import { Buffer } from 'buffer';
import { createPublicKey } from 'crypto';

export default class Ed25519PrivateDeviceCredentialCodec extends PrivateDeviceCredentialCodec {
  private static readonly SPKI_PREFIX = Buffer.from(
    '302a300506032b6570032100',
    'hex',
  );

  public toCredential(
    deviceKey: PrivateAuthorizationDeviceKey,
  ): DeviceCredential {
    const raw = Buffer.from(deviceKey.valueOf(), 'base64url');

    return DeviceCredential.fromString(
      `-----BEGIN PUBLIC KEY-----\n${Buffer.concat([
        Ed25519PrivateDeviceCredentialCodec.SPKI_PREFIX,
        raw,
      ]).toString('base64')}\n-----END PUBLIC KEY-----\n`,
    );
  }

  public toDeviceKey(
    credential: DeviceCredential,
  ): PrivateAuthorizationDeviceKey {
    try {
      const publicKey = createPublicKey(credential.valueOf());
      const der = publicKey.export({ format: 'der', type: 'spki' });
      const prefix = der.subarray(
        0,
        Ed25519PrivateDeviceCredentialCodec.SPKI_PREFIX.length,
      );

      if (
        publicKey.asymmetricKeyType !== 'ed25519' ||
        der.length !== 44 ||
        !prefix.equals(Ed25519PrivateDeviceCredentialCodec.SPKI_PREFIX)
      ) {
        throw new InvalidPrivateAuthorizationError();
      }

      return new PrivateAuthorizationDeviceKey(
        der.subarray(prefix.length).toString('base64url'),
      );
    } catch {
      throw new InvalidPrivateAuthorizationError();
    }
  }
}
