import { StickerPackNotFoundError } from '../../domain/errors/StickerPackNotFoundError';
import { StickerPackRepository } from '../../domain/repositories/StickerPackRepository';
import { StickerPack } from '../../domain/StickerPack';
import { StickerUpdateMessage } from './messages/StickerUpdateMessage';

export class StickerUpdater {
  constructor(private readonly repository: StickerPackRepository) {}

  public async update(message: StickerUpdateMessage): Promise<StickerPack> {
    const pack = await this.repository.findById(message.packId);

    if (!pack) {
      throw new StickerPackNotFoundError();
    }

    pack.updateSticker(
      message.actorIdentityId,
      message.stickerId,
      message.details,
    );

    await this.repository.save(pack);

    return pack;
  }
}
