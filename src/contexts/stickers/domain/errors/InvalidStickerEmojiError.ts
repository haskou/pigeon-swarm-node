import { DomainError } from '@haskou/value-objects';

export class InvalidStickerEmojiError extends DomainError {
  constructor() {
    super('A sticker must have at least one associated emoji.');
  }
}
