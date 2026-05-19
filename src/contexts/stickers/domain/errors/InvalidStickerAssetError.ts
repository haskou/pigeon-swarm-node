import { DomainError } from '@haskou/value-objects';

export class InvalidStickerAssetError extends DomainError {
  constructor() {
    super('Sticker asset must be an IPFS CID, not inline data.');
  }
}
