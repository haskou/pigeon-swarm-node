import StickerUserLibraryRepository from '../../domain/repositories/StickerUserLibraryRepository';
import { StickerUserLibrary } from '../../domain/StickerUserLibrary';
import { StickerUserLibraryFindMessage } from './messages/StickerUserLibraryFindMessage';

export default class StickerUserLibraryFinder {
  constructor(private readonly repository: StickerUserLibraryRepository) {}

  public async find(
    message: StickerUserLibraryFindMessage,
  ): Promise<StickerUserLibrary> {
    return (await this.repository.hasByIdentityId(message.identityId))
      ? await this.repository.requireByIdentityId(message.identityId)
      : StickerUserLibrary.create(message.identityId);
  }
}
