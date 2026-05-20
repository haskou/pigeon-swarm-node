import { StickerPackNotFoundError } from '../../domain/errors/StickerPackNotFoundError';
import { StickerPackRepository } from '../../domain/repositories/StickerPackRepository';
import { StickerPack } from '../../domain/StickerPack';
import { StickerPackUpdateMessage } from './messages/StickerPackUpdateMessage';

export class StickerPackUpdater {
  constructor(private readonly repository: StickerPackRepository) {}

  public async update(message: StickerPackUpdateMessage): Promise<StickerPack> {
    const pack = await this.repository.findById(message.packId);

    if (!pack) {
      throw new StickerPackNotFoundError();
    }

    pack.updateProfile(message.actorIdentityId, message.name);

    await this.repository.save(pack);

    return pack;
  }
}
