import { assert, StringValueObject } from '@haskou/value-objects';

import { InvalidProfileImageError } from '../errors/InvalidProfileImageError';

export class ProfileImage extends StringValueObject {
  private static readonly MAX_LENGTH = 256;

  constructor(value: string | StringValueObject) {
    super(value, ProfileImage.MAX_LENGTH);

    assert(!this.value.startsWith('data:'), new InvalidProfileImageError());
  }
}
