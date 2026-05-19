import { DomainError } from '@haskou/value-objects';

export class StickerPackOwnerMismatchError extends DomainError {
  constructor() {
    super('Only the sticker pack owner can perform this action.');
  }
}
