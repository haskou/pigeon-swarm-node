import { StickerPackRepository } from '../../domain/repositories/StickerPackRepository';
import { StickerPack } from '../../domain/StickerPack';
import { StickerPacksFindMessage } from './messages/StickerPacksFindMessage';

export class StickerPacksFinder {
  constructor(private readonly repository: StickerPackRepository) {}

  public async find(message: StickerPacksFindMessage): Promise<StickerPack[]> {
    if (message.ownerIdentityId) {
      return this.repository.findByOwner(message.ownerIdentityId);
    }

    return this.repository.findAll();
  }
}
