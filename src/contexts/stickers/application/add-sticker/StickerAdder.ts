import { StickerPackNotFoundError } from '../../domain/errors/StickerPackNotFoundError';
import StickerPackRepository from '../../domain/repositories/StickerPackRepository';
import { StickerPack } from '../../domain/StickerPack';
import { StickerAddMessage } from './messages/StickerAddMessage';

export default class StickerAdder {
  constructor(private readonly repository: StickerPackRepository) {}

  public async add(message: StickerAddMessage): Promise<StickerPack> {
    const pack = await this.repository.findById(message.packId);

    if (!pack) {
      throw new StickerPackNotFoundError();
    }

    pack.addSticker(message.actorIdentityId, message.details);

    await this.repository.save(pack);

    return pack;
  }
}
