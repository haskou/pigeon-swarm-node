import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivateDeviceCredentialCodec } from '@app/contexts/private-authorization/domain/services/PrivateDeviceCredentialCodec';
import { PrivateAuthorizationDeviceKey } from '@app/contexts/private-authorization/domain/value-objects/PrivateAuthorizationDeviceKey';
import { PublicKey } from '@haskou/pigeon-swarm-crypto';
import { Buffer } from 'buffer';

export default class Ed25519PrivateDeviceCredentialCodec extends PrivateDeviceCredentialCodec {
  public toCredential(
    deviceKey: PrivateAuthorizationDeviceKey,
  ): DeviceCredential {
    const raw = Buffer.from(deviceKey.valueOf(), 'base64url');

    if (raw.toString('base64url') !== deviceKey.valueOf()) {
      throw new InvalidPrivateAuthorizationError();
    }

    try {
      return DeviceCredential.fromString(PublicKey.fromRaw(raw).valueOf());
    } catch {
      throw new InvalidPrivateAuthorizationError();
    }
  }

  public toDeviceKey(
    credential: DeviceCredential,
  ): PrivateAuthorizationDeviceKey {
    try {
      return new PrivateAuthorizationDeviceKey(
        Buffer.from(credential.toRaw()).toString('base64url'),
      );
    } catch {
      throw new InvalidPrivateAuthorizationError();
    }
  }
}
