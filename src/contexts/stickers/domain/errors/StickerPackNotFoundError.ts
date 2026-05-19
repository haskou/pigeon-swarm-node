import { DomainError } from '@haskou/value-objects';

export class StickerPackNotFoundError extends DomainError {
  constructor() {
    super('Sticker pack not found.');
  }
}
