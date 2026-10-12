import { DomainError } from '@haskou/value-objects';

export class StickerUserLibraryNotFoundError extends DomainError {
  constructor() {
    super('Sticker user library not found.');
  }
}
