import { assert, StringValueObject } from '@haskou/value-objects';

import { InvalidPollOptionError } from '../errors/InvalidPollOptionError';

export class PollOptionId extends StringValueObject {
  constructor(value: string | StringValueObject) {
    super(value);

    assert(!this.isEmpty(), new InvalidPollOptionError());
    assert(this.valueOf().length <= 80, new InvalidPollOptionError());
  }
}
