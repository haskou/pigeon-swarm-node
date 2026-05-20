import { StickerPackRepository } from '../../domain/repositories/StickerPackRepository';
import { StickerUserLibraryRepository } from '../../domain/repositories/StickerUserLibraryRepository';
import { StickerPack } from '../../domain/StickerPack';
import { StickerUserLibrary } from '../../domain/StickerUserLibrary';
import { StickerPackCreateMessage } from './messages/StickerPackCreateMessage';

export class StickerPackCreator {
  constructor(
    private readonly packRepository: StickerPackRepository,
    private readonly libraryRepository: StickerUserLibraryRepository,
  ) {}

  private async findLibrary(
    message: StickerPackCreateMessage,
  ): Promise<StickerUserLibrary> {
    const library = await this.libraryRepository.findByIdentityId(
      message.ownerIdentityId,
    );

    return library ?? StickerUserLibrary.create(message.ownerIdentityId);
  }

  public async create(message: StickerPackCreateMessage): Promise<StickerPack> {
    const pack = StickerPack.create(message.ownerIdentityId, message.name);
    const library = await this.findLibrary(message);

    library.savePack(pack.getId());

    await this.packRepository.save(pack);
    await this.libraryRepository.save(library);

    return pack;
  }
}
