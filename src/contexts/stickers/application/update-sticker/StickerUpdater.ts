import StickerPackRepository from '../../domain/repositories/StickerPackRepository';
import { StickerPack } from '../../domain/StickerPack';
import { StickerUpdateMessage } from './messages/StickerUpdateMessage';

export default class StickerUpdater {
  constructor(private readonly repository: StickerPackRepository) {}

  public async update(message: StickerUpdateMessage): Promise<StickerPack> {
    const pack = await this.repository.requireById(message.packId);

    pack.updateSticker(
      message.actorIdentityId,
      message.stickerId,
      message.details,
      message.updatedAt,
    );

    await this.repository.save(pack, message.proof);

    return pack;
  }
}
