import { StickerNotFoundError } from '../../domain/errors/StickerNotFoundError';
import { StickerPackNotFoundError } from '../../domain/errors/StickerPackNotFoundError';
import StickerPackRepository from '../../domain/repositories/StickerPackRepository';
import StickerUserLibraryRepository from '../../domain/repositories/StickerUserLibraryRepository';
import { StickerUserLibrary } from '../../domain/StickerUserLibrary';
import { StickerUseRecordMessage } from './messages/StickerUseRecordMessage';

export default class StickerUseRecorder {
  constructor(
    private readonly packRepository: StickerPackRepository,
    private readonly libraryRepository: StickerUserLibraryRepository,
  ) {}

  private async findLibrary(
    message: StickerUseRecordMessage,
  ): Promise<StickerUserLibrary> {
    const library = await this.libraryRepository.findByIdentityId(
      message.identityId,
    );

    return library ?? StickerUserLibrary.create(message.identityId);
  }

  public async record(
    message: StickerUseRecordMessage,
  ): Promise<StickerUserLibrary> {
    const pack = await this.packRepository.findById(message.packId);

    if (!pack) {
      throw new StickerPackNotFoundError();
    }

    if (!pack.hasSticker(message.stickerId)) {
      throw new StickerNotFoundError();
    }

    const library = await this.findLibrary(message);

    library.recordStickerUse(message.packId, message.stickerId);

    await this.libraryRepository.save(library);

    return library;
  }
}
