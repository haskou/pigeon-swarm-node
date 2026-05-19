import { DomainError } from '@haskou/value-objects';

export class InvalidStickerDimensionsError extends DomainError {
  constructor(maxPixels: number) {
    super(`Sticker dimensions must be at most ${maxPixels}x${maxPixels}.`);
  }
}
