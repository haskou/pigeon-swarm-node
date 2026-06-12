import { StickerPackNotFoundError } from '../../domain/errors/StickerPackNotFoundError';
import StickerPackRepository from '../../domain/repositories/StickerPackRepository';
import { StickerPack } from '../../domain/StickerPack';
import { StickerPackFindMessage } from './messages/StickerPackFindMessage';

export class StickerPackFinder {
  constructor(private readonly repository: StickerPackRepository) {}

  public async find(message: StickerPackFindMessage): Promise<StickerPack> {
    const pack = await this.repository.findById(message.packId);

    if (!pack) {
      throw new StickerPackNotFoundError();
    }

    return pack;
  }
}
