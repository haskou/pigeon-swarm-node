import { assert, Integer, NumberValueObject } from '@haskou/value-objects';

import { InvalidCommunityInviteMaxUsesError } from '../errors/InvalidCommunityInviteMaxUsesError';

export class CommunityInviteMaxUses extends Integer {
  constructor(value: number | NumberValueObject) {
    super(value);

    assert(this.isGreaterThan(0), new InvalidCommunityInviteMaxUsesError());
  }
}
