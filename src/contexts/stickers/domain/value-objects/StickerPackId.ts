import { assert, ShortId, StringValueObject } from '@haskou/value-objects';

import { InvalidStickerIdError } from '../errors/InvalidStickerIdError';

/**
 * Client-chosen ids are ASCII letters, digits, `-` and `_`, at most 32 long.
 * Page positions hold them unescaped, so the bound keeps every position under
 * the cursor cap.
 */
export class StickerPackId extends StringValueObject {
  private static readonly MAX_LENGTH = 32;
  private static readonly PATTERN = /^[A-Za-z0-9_-]+$/;

  public static generate(): StickerPackId {
    return new StickerPackId(ShortId.generate().valueOf());
  }

  constructor(value: string | StringValueObject) {
    super(value, StickerPackId.MAX_LENGTH);

    assert(
      StickerPackId.PATTERN.test(this.value),
      new InvalidStickerIdError('Sticker pack'),
    );
  }
}
