import { assert, Integer } from '@haskou/value-objects';

import { InvalidStickerSizeError } from '../errors/InvalidStickerSizeError';
import { StickerType } from './StickerType';

export class StickerSize extends Integer {
  constructor(value: number, type: StickerType) {
    super(value);

    const maxSize = new Integer(type.getMaxSizeBytes());
    const minSize = new Integer(0);

    assert(
      this.isGreaterThan(minSize) && this.isLessOrEqualThan(maxSize),
      new InvalidStickerSizeError(maxSize.valueOf()),
    );
  }
}
