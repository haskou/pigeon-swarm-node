import { StickerDetails } from '@app/contexts/stickers/domain/StickerDetails';
import { StickerAssetCid } from '@app/contexts/stickers/domain/value-objects/StickerAssetCid';
import { StickerContentType } from '@app/contexts/stickers/domain/value-objects/StickerContentType';
import { StickerDimensions } from '@app/contexts/stickers/domain/value-objects/StickerDimensions';
import { StickerEmoji } from '@app/contexts/stickers/domain/value-objects/StickerEmoji';
import { StickerName } from '@app/contexts/stickers/domain/value-objects/StickerName';
import { StickerSize } from '@app/contexts/stickers/domain/value-objects/StickerSize';
import { StickerType } from '@app/contexts/stickers/domain/value-objects/StickerType';
import { Integer } from '@haskou/value-objects';

import { StickerBody } from '../bodies/StickerBody';

export class StickerBodyMapper {
  constructor(private readonly body: StickerBody) {}

  public assetCid(): StickerAssetCid {
    return new StickerAssetCid(this.body.assetCid);
  }

  public contentType(): StickerContentType {
    return new StickerContentType(this.body.contentType);
  }

  public details(): StickerDetails {
    const type = this.type();

    return new StickerDetails(
      this.name(),
      type,
      this.assetCid(),
      this.contentType(),
      this.size(type),
      this.dimensions(),
      this.emojis(),
    );
  }

  public dimensions(): StickerDimensions {
    return new StickerDimensions(
      new Integer(this.body.dimensions.width),
      new Integer(this.body.dimensions.height),
    );
  }

  public emojis(): StickerEmoji[] {
    return this.body.emojis.map((emoji) => new StickerEmoji(emoji));
  }

  public name(): StickerName {
    return new StickerName(this.body.name);
  }

  public size(type: StickerType): StickerSize {
    return new StickerSize(this.body.sizeBytes, type);
  }

  public type(): StickerType {
    return StickerType.fromPrimitives(this.body.type);
  }
}
