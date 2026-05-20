import { StickerPackId } from '../../../domain/value-objects/StickerPackId';

export class StickerPackFindMessage {
  public readonly packId: StickerPackId;

  constructor(packId: string) {
    this.packId = new StickerPackId(packId);
  }
}
