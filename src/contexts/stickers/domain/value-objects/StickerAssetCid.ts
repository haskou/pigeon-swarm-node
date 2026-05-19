import { assert, StringValueObject } from '@haskou/value-objects';

import { InvalidStickerAssetError } from '../errors/InvalidStickerAssetError';

export class StickerAssetCid extends StringValueObject {
  private static readonly MAX_LENGTH = 256;

  constructor(value: string | StringValueObject) {
    super(value, StickerAssetCid.MAX_LENGTH);

    assert(!this.value.startsWith('data:'), new InvalidStickerAssetError());
  }
}
