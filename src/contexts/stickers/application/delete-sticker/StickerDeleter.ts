import { StickerPackNotFoundError } from '../../domain/errors/StickerPackNotFoundError';
import StickerPackRepository from '../../domain/repositories/StickerPackRepository';
import { StickerPack } from '../../domain/StickerPack';
import { StickerDeleteMessage } from './messages/StickerDeleteMessage';

export default class StickerDeleter {
  constructor(private readonly repository: StickerPackRepository) {}

  public async delete(message: StickerDeleteMessage): Promise<StickerPack> {
    const pack = await this.repository.findById(message.packId);

    if (!pack) {
      throw new StickerPackNotFoundError();
    }

    pack.removeSticker(message.actorIdentityId, message.stickerId);

    await this.repository.save(pack);

    return pack;
  }
}
