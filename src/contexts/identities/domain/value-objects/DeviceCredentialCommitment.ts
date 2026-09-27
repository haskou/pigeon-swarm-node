import { SHA256Hash } from '@haskou/pigeon-swarm-crypto';
import { StringValueObject } from '@haskou/value-objects';

import type { DeviceCredential } from './DeviceCredential';

export class DeviceCredentialCommitment extends SHA256Hash {
  public static fromCredential(
    credential: DeviceCredential,
  ): DeviceCredentialCommitment {
    return new DeviceCredentialCommitment(
      SHA256Hash.from(new StringValueObject(credential.valueOf())).valueOf(),
    );
  }

  public constructor(value: string | StringValueObject) {
    super(value);
  }
}
