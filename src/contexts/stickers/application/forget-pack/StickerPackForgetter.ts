import StickerUserLibraryRepository from '../../domain/repositories/StickerUserLibraryRepository';
import { StickerUserLibrary } from '../../domain/StickerUserLibrary';
import { StickerPackForgetMessage } from './messages/StickerPackForgetMessage';

export default class StickerPackForgetter {
  constructor(private readonly repository: StickerUserLibraryRepository) {}

  private async findLibrary(
    message: StickerPackForgetMessage,
  ): Promise<StickerUserLibrary> {
    const library = await this.repository.findByIdentityId(message.identityId);

    return library ?? StickerUserLibrary.create(message.identityId);
  }

  public async forget(
    message: StickerPackForgetMessage,
  ): Promise<StickerUserLibrary> {
    const library = await this.findLibrary(message);

    library.forgetPack(message.packId);

    await this.repository.save(library);

    return library;
  }
}
