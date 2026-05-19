import { DomainError } from '@haskou/value-objects';

export class StickerNotFoundError extends DomainError {
  constructor() {
    super('Sticker not found.');
  }
}
