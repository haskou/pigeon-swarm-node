import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PublicKey } from '@haskou/pigeon-swarm-crypto';
import { StringValueObject } from '@haskou/value-objects';

import { DeviceCredentialCommitment } from './DeviceCredentialCommitment';

export class DeviceCredential extends PublicKey {
  public static fromIdentityId(identityId: IdentityId): DeviceCredential {
    return new DeviceCredential(identityId.toString());
  }

  public static fromString(
    value: string | StringValueObject,
  ): DeviceCredential {
    return new DeviceCredential(value);
  }

  public getCommitment(): DeviceCredentialCommitment {
    return DeviceCredentialCommitment.fromCredential(this);
  }
}
