import { assert, StringValueObject } from '@haskou/value-objects';

import { InvalidPollQuestionError } from '../errors/InvalidPollQuestionError';

export class PollQuestion extends StringValueObject {
  constructor(value: string | StringValueObject) {
    super(value);

    assert(!this.isEmpty(), new InvalidPollQuestionError());
    assert(this.valueOf().length <= 200, new InvalidPollQuestionError());
  }
}
