import { Enum } from '@haskou/value-objects';

import { InvalidStickerTypeError } from '../errors/InvalidStickerTypeError';

export type StickerTypeValue = 'animated' | 'static' | 'video';

const stickerTypes: Record<string, StickerTypeValue> = {
  ANIMATED: 'animated',
  STATIC: 'static',
  VIDEO: 'video',
};

export class StickerType extends Enum<StickerTypeValue> {
  public static readonly ANIMATED = new StickerType(stickerTypes.ANIMATED);

  public static readonly STATIC = new StickerType(stickerTypes.STATIC);

  public static readonly VIDEO = new StickerType(stickerTypes.VIDEO);

  public static fromPrimitives(value: string): StickerType {
    switch (value) {
      case stickerTypes.ANIMATED:
        return StickerType.ANIMATED;
      case stickerTypes.STATIC:
        return StickerType.STATIC;
      case stickerTypes.VIDEO:
        return StickerType.VIDEO;
      default:
        throw new InvalidStickerTypeError(value);
    }
  }

  public getMaxSizeBytes(): number {
    if (this.isAnimated()) {
      return 64 * 1024;
    }

    if (this.isVideo()) {
      return 256 * 1024;
    }

    return 512 * 1024;
  }

  public getValues(): StickerTypeValue[] {
    return Object.values(stickerTypes);
  }

  public isAnimated(): boolean {
    return this.isEqual(StickerType.ANIMATED);
  }

  public isVideo(): boolean {
    return this.isEqual(StickerType.VIDEO);
  }
}
