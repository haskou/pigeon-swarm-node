import { DomainError } from '@haskou/value-objects';

export class InvalidStickerTypeError extends DomainError {
  constructor(value: string) {
    super(`Invalid sticker type: ${value}.`);
  }
}
