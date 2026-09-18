import { assert, Integer } from '@haskou/value-objects';

import { InvalidCallSessionEpochError } from '../errors/InvalidCallSessionEpochError';

export class CallSessionEpoch extends Integer {
  constructor(value: number) {
    super(value);
    assert(
      Number.isSafeInteger(value) && value > 0,
      new InvalidCallSessionEpochError(),
    );
  }
}
