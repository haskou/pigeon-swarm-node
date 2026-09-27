import { PublicKey } from '@haskou/pigeon-swarm-crypto';
import { StringValueObject } from '@haskou/value-objects';

export class RecoveryAuthority extends PublicKey {
  public static fromString(
    value: string | StringValueObject,
  ): RecoveryAuthority {
    return new RecoveryAuthority(value);
  }
}
