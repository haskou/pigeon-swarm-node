import { assert, ShortId, StringValueObject } from '@haskou/value-objects';

import { InvalidStickerIdError } from '../errors/InvalidStickerIdError';

/**
 * Client-chosen ids are ASCII letters, digits, `-` and `_`, at most 32 long.
 * Page positions hold them unescaped, so the bound keeps every position under
 * the cursor cap.
 */
export class StickerId extends StringValueObject {
  private static readonly MAX_LENGTH = 32;
  private static readonly PATTERN = /^[A-Za-z0-9_-]+$/;

  public static generate(): StickerId {
    return new StickerId(ShortId.generate().valueOf());
  }

  constructor(value: string | StringValueObject) {
    super(value, StickerId.MAX_LENGTH);

    assert(
      StickerId.PATTERN.test(this.value),
      new InvalidStickerIdError('Sticker'),
    );
  }
}
