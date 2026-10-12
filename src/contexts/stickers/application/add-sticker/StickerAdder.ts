import StickerPackRepository from '../../domain/repositories/StickerPackRepository';
import { StickerPack } from '../../domain/StickerPack';
import { StickerAddMessage } from './messages/StickerAddMessage';

export default class StickerAdder {
  constructor(private readonly repository: StickerPackRepository) {}

  public async add(message: StickerAddMessage): Promise<StickerPack> {
    const pack = await this.repository.requireById(message.packId);

    pack.addSticker(
      message.actorIdentityId,
      message.stickerId,
      message.details,
      message.updatedAt,
    );

    await this.repository.save(pack, message.proof);

    return pack;
  }
}
