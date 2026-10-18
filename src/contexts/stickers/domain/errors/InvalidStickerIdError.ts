import { DomainError } from '@haskou/value-objects';

export class InvalidStickerIdError extends DomainError {
  constructor(kind: 'Sticker' | 'Sticker pack') {
    super(
      `${kind} id must be 1 to 36 ASCII letters, digits, '-' or '_' characters.`,
    );
  }
}
