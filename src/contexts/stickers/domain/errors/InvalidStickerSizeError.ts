import { DomainError } from '@haskou/value-objects';

export class InvalidStickerSizeError extends DomainError {
  constructor(maxSizeBytes: number) {
    super(`Sticker size must be at most ${maxSizeBytes} bytes.`);
  }
}
