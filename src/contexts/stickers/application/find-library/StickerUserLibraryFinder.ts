import { StickerUserLibraryRepository } from '../../domain/repositories/StickerUserLibraryRepository';
import { StickerUserLibrary } from '../../domain/StickerUserLibrary';
import { StickerUserLibraryFindMessage } from './messages/StickerUserLibraryFindMessage';

export class StickerUserLibraryFinder {
  constructor(private readonly repository: StickerUserLibraryRepository) {}

  public async find(
    message: StickerUserLibraryFindMessage,
  ): Promise<StickerUserLibrary> {
    const library = await this.repository.findByIdentityId(message.identityId);

    return library ?? StickerUserLibrary.create(message.identityId);
  }
}
