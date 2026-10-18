import { assert, ShortId, StringValueObject } from '@haskou/value-objects';

import { InvalidStickerIdError } from '../errors/InvalidStickerIdError';

/**
 * Ids are ASCII letters, digits, `-` and `_`, at most a UUID long (36).
 * The UI generates UUIDs and the node generates 24-char ShortIds, so both
 * fit. Page positions hold ids unescaped; the bound keeps them under the
 * cursor cap.
 */
export class StickerId extends StringValueObject {
  private static readonly MAX_LENGTH = 36;
  private static readonly PATTERN = /^[A-Za-z0-9_-]+$/;

  public static isValid(value: string): boolean {
    return (
      value.length > 0 &&
      value.length <= StickerId.MAX_LENGTH &&
      StickerId.PATTERN.test(value)
    );
  }

  public static generate(): StickerId {
    return new StickerId(ShortId.generate().valueOf());
  }

  constructor(value: string | StringValueObject) {
    assert(
      StickerId.isValid(value.valueOf()),
      new InvalidStickerIdError('Sticker'),
    );

    super(value, StickerId.MAX_LENGTH);
  }
}
