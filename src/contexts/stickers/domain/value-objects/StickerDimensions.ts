import { assert, Integer, PrimitiveOf } from '@haskou/value-objects';

import { InvalidStickerDimensionsError } from '../errors/InvalidStickerDimensionsError';

export class StickerDimensions {
  private static readonly MAX_PIXELS = new Integer(512);

  public static fromPrimitives(
    primitives: PrimitiveOf<StickerDimensions>,
  ): StickerDimensions {
    return new StickerDimensions(
      new Integer(primitives.width),
      new Integer(primitives.height),
    );
  }

  constructor(
    private readonly width: Integer,
    private readonly height: Integer,
  ) {
    const minPixels = new Integer(0);

    assert(
      this.width.isGreaterThan(minPixels) &&
        this.height.isGreaterThan(minPixels) &&
        this.width.isLessOrEqualThan(StickerDimensions.MAX_PIXELS) &&
        this.height.isLessOrEqualThan(StickerDimensions.MAX_PIXELS),
      new InvalidStickerDimensionsError(StickerDimensions.MAX_PIXELS.valueOf()),
    );
  }

  public toPrimitives() {
    return {
      height: this.height.valueOf(),
      width: this.width.valueOf(),
    };
  }
}
