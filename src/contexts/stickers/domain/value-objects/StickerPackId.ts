import { ShortId, StringValueObject } from '@haskou/value-objects';

export class StickerPackId extends StringValueObject {
  public static generate(): StickerPackId {
    return new StickerPackId(ShortId.generate().valueOf());
  }
}
