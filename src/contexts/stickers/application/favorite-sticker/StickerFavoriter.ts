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

  private async findLibrary(
    message: StickerFavoriteMessage,
  ): Promise<StickerUserLibrary> {
    const library = await this.libraryRepository.findByIdentityId(
      message.identityId,
    );

    return library ?? StickerUserLibrary.create(message.identityId);
  }

  public async favorite(
    message: StickerFavoriteMessage,
  ): Promise<StickerUserLibrary> {
    const pack = await this.packRepository.findById(message.packId);

    if (!pack) {
      throw new StickerPackNotFoundError();
    }

    pack.assertHasSticker(message.stickerId);

    const library = await this.findLibrary(message);

    library.favoriteSticker(message.packId, message.stickerId);

    await this.libraryRepository.save(library);

    return library;
  }
}
