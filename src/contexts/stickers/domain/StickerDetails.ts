import { PrimitiveOf } from '@haskou/value-objects';

import { StickerAssetCid } from './value-objects/StickerAssetCid';
import { StickerContentType } from './value-objects/StickerContentType';
import { StickerDimensions } from './value-objects/StickerDimensions';
import { StickerSize } from './value-objects/StickerSize';
import { StickerType } from './value-objects/StickerType';

export class StickerDetails {
  public static fromPrimitives(
    primitives: PrimitiveOf<StickerDetails>,
  ): StickerDetails {
    const type = StickerType.fromPrimitives(primitives.type);

    return new StickerDetails(
      type,
      new StickerAssetCid(primitives.assetCid),
      new StickerContentType(primitives.contentType),
      new StickerSize(primitives.sizeBytes, type),
      StickerDimensions.fromPrimitives(primitives.dimensions),
    );
  }

  constructor(
    private readonly type: StickerType,
    private readonly assetCid: StickerAssetCid,
    private readonly contentType: StickerContentType,
    private readonly size: StickerSize,
    private readonly dimensions: StickerDimensions,
  ) {}

  public toPrimitives() {
    return {
      assetCid: this.assetCid.valueOf(),
      contentType: this.contentType.valueOf(),
      dimensions: this.dimensions.toPrimitives(),
      sizeBytes: this.size.valueOf(),
      type: this.type.valueOf(),
    };
  }
}
