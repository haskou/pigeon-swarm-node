import { StringValueObject } from '@haskou/value-objects';

export class StickerPackDescription extends StringValueObject {
  private static readonly MAX_LENGTH = 500;

  constructor(value: string | StringValueObject) {
    super(value, StickerPackDescription.MAX_LENGTH);
  }
}
