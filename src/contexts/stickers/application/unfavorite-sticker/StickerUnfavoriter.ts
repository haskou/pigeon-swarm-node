import { StickerUserLibraryRepository } from '../../domain/repositories/StickerUserLibraryRepository';
import { StickerUserLibrary } from '../../domain/StickerUserLibrary';
import { StickerUnfavoriteMessage } from './messages/StickerUnfavoriteMessage';

export class StickerUnfavoriter {
  constructor(private readonly repository: StickerUserLibraryRepository) {}

  private async findLibrary(
    message: StickerUnfavoriteMessage,
  ): Promise<StickerUserLibrary> {
    const library = await this.repository.findByIdentityId(message.identityId);

    return library ?? StickerUserLibrary.create(message.identityId);
  }

  public async unfavorite(
    message: StickerUnfavoriteMessage,
  ): Promise<StickerUserLibrary> {
    const library = await this.findLibrary(message);

    library.unfavoriteSticker(message.packId, message.stickerId);

    await this.repository.save(library);

    return library;
  }
}
