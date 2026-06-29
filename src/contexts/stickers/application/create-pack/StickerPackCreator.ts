import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import StickerPackRepository from '../../domain/repositories/StickerPackRepository';
import StickerUserLibraryRepository from '../../domain/repositories/StickerUserLibraryRepository';
import { StickerPack } from '../../domain/StickerPack';
import { StickerUserLibrary } from '../../domain/StickerUserLibrary';
import { StickerUserLibraryLookup } from '../StickerUserLibraryLookup';
import { StickerPackCreateMessage } from './messages/StickerPackCreateMessage';

export default class StickerPackCreator {
  constructor(
    private readonly packRepository: StickerPackRepository,
    private readonly libraryRepository: StickerUserLibraryRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  private async findLibrary(
    message: StickerPackCreateMessage,
  ): Promise<StickerUserLibraryLookup> {
    const library = await this.libraryRepository.findByIdentityId(
      message.ownerIdentityId,
    );

    return library
      ? StickerUserLibraryLookup.existing(library)
      : StickerUserLibraryLookup.created(
          StickerUserLibrary.create(message.ownerIdentityId),
        );
  }

  public async create(message: StickerPackCreateMessage): Promise<StickerPack> {
    const pack = StickerPack.create(message.ownerIdentityId, message.name);
    const lookup = await this.findLibrary(message);
    const { library } = lookup;

    library.savePack(pack.getId());

    await this.packRepository.save(pack);
    await this.libraryRepository.save(library);
    await this.eventPublisher.publish([
      ...pack.pullDomainEvents(),
      ...(lookup.created ? library.pullDomainEvents() : []),
    ]);

    return pack;
  }
}
