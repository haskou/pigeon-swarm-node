import { BearerCapability } from '@haskou/pigeon-swarm-crypto';
import { assert, StringValueObject } from '@haskou/value-objects';

import { InvalidCallScopeError } from '../errors/InvalidCallScopeError';

/**
 * Commitment to the join capability of a group call. Members derive the
 * capability from the MLS exporter of the group epoch, so the node can admit
 * a holder without knowing who is in the group. The node stores only this
 * commitment, never the capability.
 */
export class CallCapabilityHash extends StringValueObject {
  private static readonly PATTERN = /^[0-9a-f]{64}$/;

  constructor(value: string) {
    super(value, 64);

    assert(
      CallCapabilityHash.PATTERN.test(this.value),
      new InvalidCallScopeError(),
    );
  }

  public matches(capability: string): boolean {
    return BearerCapability.verify(capability, this.value);
  }
}
