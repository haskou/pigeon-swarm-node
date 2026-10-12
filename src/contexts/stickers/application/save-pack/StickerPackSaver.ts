import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import StickerPackRepository from '../../domain/repositories/StickerPackRepository';
import StickerUserLibraryRepository from '../../domain/repositories/StickerUserLibraryRepository';
import { StickerUserLibrary } from '../../domain/StickerUserLibrary';
import { StickerUserLibraryLookup } from '../StickerUserLibraryLookup';
import { StickerPackSaveMessage } from './messages/StickerPackSaveMessage';

export default class StickerPackSaver {
  constructor(
    private readonly packRepository: StickerPackRepository,
    private readonly libraryRepository: StickerUserLibraryRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  private async findLibrary(
    message: StickerPackSaveMessage,
  ): Promise<StickerUserLibraryLookup> {
    const hasLibrary = await this.libraryRepository.hasByIdentityId(
      message.identityId,
    );
    const library = hasLibrary
      ? await this.libraryRepository.requireByIdentityId(message.identityId)
      : undefined;

    return library
      ? StickerUserLibraryLookup.existing(library)
      : StickerUserLibraryLookup.created(
          StickerUserLibrary.create(message.identityId),
        );
  }

  public async save(
    message: StickerPackSaveMessage,
  ): Promise<StickerUserLibrary> {
    await this.packRepository.requireById(message.packId);

    const lookup = await this.findLibrary(message);

    await this.libraryRepository.savePack(
      message.identityId,
      message.packId,
      message.savedAt,
      message.proof,
    );
    await this.eventPublisher.publish(
      lookup.created ? lookup.library.pullDomainEvents() : [],
    );

    return (await this.libraryRepository.hasByIdentityId(message.identityId))
      ? await this.libraryRepository.requireByIdentityId(message.identityId)
      : lookup.library;
  }
}
