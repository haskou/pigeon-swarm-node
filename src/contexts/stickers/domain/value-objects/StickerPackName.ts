import { StringValueObject } from '@haskou/value-objects';

export class StickerPackName extends StringValueObject {
  private static readonly MAX_LENGTH = 80;

  constructor(value: string | StringValueObject) {
    super(value, StickerPackName.MAX_LENGTH);
  }
}
