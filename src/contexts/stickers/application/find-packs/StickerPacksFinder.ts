import { PageSlice } from '@app/contexts/shared/application/pagination/PageSlice';

import StickerPackRepository from '../../domain/repositories/StickerPackRepository';
import { StickerPack } from '../../domain/StickerPack';
import { StickerPacksFindMessage } from './messages/StickerPacksFindMessage';
import { StickerPackPosition } from './StickerPackPosition';

export default class StickerPacksFinder {
  constructor(private readonly repository: StickerPackRepository) {}

  /** One page of packs, most recently updated first. */
  public async find(
    message: StickerPacksFindMessage,
  ): Promise<PageSlice<StickerPack>> {
    const packs = message.ownerIdentityId
      ? await this.repository.findByOwner(message.ownerIdentityId)
      : await this.repository.findAll();

    return PageSlice.of({
      after: message.after,
      items: packs,
      limit: message.limit,
      order: 'desc',
      position: (pack) => StickerPackPosition.of(pack),
    });
  }

  /** Every known pack, unpaged, for resolving the packs a library saved. */
  public async findAll(): Promise<StickerPack[]> {
    return this.repository.findAll();
  }
}
