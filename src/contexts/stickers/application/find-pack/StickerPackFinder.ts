import StickerPackRepository from '../../domain/repositories/StickerPackRepository';
import { StickerPack } from '../../domain/StickerPack';
import { StickerPackFindMessage } from './messages/StickerPackFindMessage';

export default class StickerPackFinder {
  constructor(private readonly repository: StickerPackRepository) {}

  public async find(message: StickerPackFindMessage): Promise<StickerPack> {
    const pack = await this.repository.requireById(message.packId);

    return pack;
  }
}
