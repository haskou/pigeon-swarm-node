import { assert, StringValueObject } from '@haskou/value-objects';

import { InvalidStickerEmojiError } from '../errors/InvalidStickerEmojiError';

export class StickerEmoji extends StringValueObject {
  private static readonly MAX_LENGTH = 32;

  constructor(value: string | StringValueObject) {
    super(value, StickerEmoji.MAX_LENGTH);

    assert(!this.isEmpty(), new InvalidStickerEmojiError());
  }
}
