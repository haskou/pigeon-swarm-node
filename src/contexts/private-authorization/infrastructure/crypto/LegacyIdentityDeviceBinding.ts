import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivateIdentityBinding } from '@app/contexts/private-authorization/domain/services/PrivateIdentityBinding';
import { Buffer } from 'buffer';

export default class LegacyIdentityDeviceBinding extends PrivateIdentityBinding {
  private static readonly ED25519_SPKI_PREFIX = Buffer.from(
    '302a300506032b6570032100',
    'hex',
  );

  public bind(identitySpki: string): string {
    try {
      const der = Buffer.from(identitySpki, 'base64');
      const prefix = der.subarray(
        0,
        LegacyIdentityDeviceBinding.ED25519_SPKI_PREFIX.length,
      );

      if (
        der.length !== 44 ||
        der.toString('base64') !== identitySpki ||
        !prefix.equals(LegacyIdentityDeviceBinding.ED25519_SPKI_PREFIX)
      ) {
        throw new InvalidPrivateAuthorizationError();
      }

      return der.subarray(prefix.length).toString('base64url');
    } catch {
      throw new InvalidPrivateAuthorizationError();
    }
  }

  public identityIdFor(deviceKey: string): string {
    try {
      const raw = Buffer.from(deviceKey, 'base64url');

      if (raw.length !== 32 || raw.toString('base64url') !== deviceKey) {
        throw new InvalidPrivateAuthorizationError();
      }

      return Buffer.concat([
        LegacyIdentityDeviceBinding.ED25519_SPKI_PREFIX,
        raw,
      ]).toString('base64');
    } catch {
      throw new InvalidPrivateAuthorizationError();
    }
  }
}
