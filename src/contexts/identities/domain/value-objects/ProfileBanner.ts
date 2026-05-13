import { assert, StringValueObject } from '@haskou/value-objects';

import { InvalidProfileBannerError } from '../errors/InvalidProfileBannerError';

export class ProfileBanner extends StringValueObject {
  private static readonly MAX_LENGTH = 256;

  constructor(value: string | StringValueObject) {
    super(value, ProfileBanner.MAX_LENGTH);

    assert(!this.value.startsWith('data:'), new InvalidProfileBannerError());
  }
}
