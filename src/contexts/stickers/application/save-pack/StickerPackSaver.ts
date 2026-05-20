import { StickerPackNotFoundError } from '../../domain/errors/StickerPackNotFoundError';
import { StickerPackRepository } from '../../domain/repositories/StickerPackRepository';
import { StickerUserLibraryRepository } from '../../domain/repositories/StickerUserLibraryRepository';
import { StickerUserLibrary } from '../../domain/StickerUserLibrary';
import { StickerPackSaveMessage } from './messages/StickerPackSaveMessage';

export class StickerPackSaver {
  constructor(
    private readonly packRepository: StickerPackRepository,
    private readonly libraryRepository: StickerUserLibraryRepository,
  ) {}

  private async findLibrary(
    message: StickerPackSaveMessage,
  ): Promise<StickerUserLibrary> {
    const library = await this.libraryRepository.findByIdentityId(
      message.identityId,
    );

    return library ?? StickerUserLibrary.create(message.identityId);
  }

  public async save(
    message: StickerPackSaveMessage,
  ): Promise<StickerUserLibrary> {
    const pack = await this.packRepository.findById(message.packId);

    if (!pack) {
      throw new StickerPackNotFoundError();
    }

    const library = await this.findLibrary(message);

    library.savePack(message.packId);

    await this.libraryRepository.save(library);

    return library;
  }
}
