import { StringValueObject } from '@haskou/value-objects';

export class StickerContentType extends StringValueObject {
  private static readonly MAX_LENGTH = 128;

  constructor(value: string | StringValueObject) {
    super(value, StickerContentType.MAX_LENGTH);
  }
}
