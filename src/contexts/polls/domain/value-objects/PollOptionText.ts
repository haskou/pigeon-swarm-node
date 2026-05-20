import { assert, StringValueObject } from '@haskou/value-objects';

import { InvalidPollOptionError } from '../errors/InvalidPollOptionError';

export class PollOptionText extends StringValueObject {
  constructor(value: string | StringValueObject) {
    super(value);

    assert(!this.isEmpty(), new InvalidPollOptionError());
    assert(this.valueOf().length <= 120, new InvalidPollOptionError());
  }
}
