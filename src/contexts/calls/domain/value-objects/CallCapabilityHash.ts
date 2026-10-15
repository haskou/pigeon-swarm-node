import { assert, StringValueObject } from '@haskou/value-objects';
import { createHash, timingSafeEqual } from 'crypto';

import { InvalidCallScopeError } from '../errors/InvalidCallScopeError';

/**
 * SHA-256 hex of the join capability of a group call. Members derive the
 * capability from the MLS exporter of the group epoch, so the node can admit
 * a holder without knowing who is in the group. The node stores only this
 * hash; the capability carries 256 bits, so an unsalted fast hash suffices.
 */
export class CallCapabilityHash extends StringValueObject {
  private static readonly PATTERN = /^[0-9a-f]{64}$/;

  public static of(capability: string): CallCapabilityHash {
    return new CallCapabilityHash(
      createHash('sha256').update(capability).digest('hex'),
    );
  }

  constructor(value: string) {
    super(value, 64);

    assert(
      CallCapabilityHash.PATTERN.test(this.value),
      new InvalidCallScopeError(),
    );
  }

  public matches(capability: string): boolean {
    const actual = Buffer.from(
      CallCapabilityHash.of(capability).valueOf(),
      'hex',
    );
    const expected = Buffer.from(this.value, 'hex');

    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }
}
