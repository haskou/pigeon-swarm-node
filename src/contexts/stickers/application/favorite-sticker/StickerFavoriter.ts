import { StickerNotFoundError } from '../../domain/errors/StickerNotFoundError';
import { StickerPackNotFoundError } from '../../domain/errors/StickerPackNotFoundError';
import StickerPackRepository from '../../domain/repositories/StickerPackRepository';
import StickerUserLibraryRepository from '../../domain/repositories/StickerUserLibraryRepository';
import { StickerUserLibrary } from '../../domain/StickerUserLibrary';
import { StickerFavoriteMessage } from './messages/StickerFavoriteMessage';

export default class StickerFavoriter {
  constructor(
    private readonly packRepository: StickerPackRepository,
    private readonly libraryRepository: StickerUserLibraryRepository,
  ) {}

  public async favorite(
    message: StickerFavoriteMessage,
  ): Promise<StickerUserLibrary> {
    const pack = await this.packRepository.findById(message.packId);

    if (!pack) {
      throw new StickerPackNotFoundError();
    }

    if (!pack.hasSticker(message.stickerId)) {
      throw new StickerNotFoundError();
    }

    await this.libraryRepository.favorite(
      message.identityId,
      message.packId,
      message.stickerId,
      message.favoritedAt,
      message.proof,
    );

    return (
      (await this.libraryRepository.findByIdentityId(message.identityId)) ??
      StickerUserLibrary.create(message.identityId)
    );
  }
}
