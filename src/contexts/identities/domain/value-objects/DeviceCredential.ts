import { compareCodeUnits } from '@app/contexts/shared/domain/compareCodeUnits';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PublicKey } from '@haskou/pigeon-swarm-crypto';
import { StringValueObject } from '@haskou/value-objects';

import { DeviceCredentialCommitment } from './DeviceCredentialCommitment';

export class DeviceCredential extends PublicKey {
  public static fromIdentityId(identityId: IdentityId): DeviceCredential {
    return new DeviceCredential(identityId.toString());
  }

  /** Parses the wire form: the identity-id body without PEM headers. */
  public static fromWire(value: string): DeviceCredential {
    return DeviceCredential.fromIdentityId(new IdentityId(value));
  }

  public static fromString(
    value: string | StringValueObject,
  ): DeviceCredential {
    return new DeviceCredential(value);
  }

  public getCommitment(): DeviceCredentialCommitment {
    return DeviceCredentialCommitment.fromCredential(this);
  }

  /** Wire form: the identity-id body without PEM headers. */
  public toWire(): string {
    return new IdentityId(this.valueOf()).valueOf();
  }

  /** Code-unit order: the strict ascending check on compromised credentials. */
  public isLessThan(other: DeviceCredential): boolean {
    return this.valueOf() < other.valueOf();
  }

  /**
   * Code-unit order: deterministic sort and pick among credentials. Locale
   * collation would let nodes with different ICU data disagree.
   */
  public compareTo(other: DeviceCredential): number {
    return compareCodeUnits(this.valueOf(), other.valueOf());
  }
}
