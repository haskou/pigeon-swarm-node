import { assert, StringValueObject } from '@haskou/value-objects';

import { InvalidPresenceCustomMessageLengthError } from '../errors/InvalidPresenceCustomMessageLengthError';

export class PresenceCustomMessage extends StringValueObject {
  private static readonly MAX_LENGTH = 50;

  constructor(value: string | StringValueObject) {
    super(value);
    assert(
      this.valueOf().length <= PresenceCustomMessage.MAX_LENGTH,
      new InvalidPresenceCustomMessageLengthError(
        PresenceCustomMessage.MAX_LENGTH,
      ),
    );
  }
}
