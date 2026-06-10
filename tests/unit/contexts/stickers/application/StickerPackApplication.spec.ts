import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { StickerAddMessage } from '@app/contexts/stickers/application/add-sticker/messages/StickerAddMessage';
import { StickerAdder } from '@app/contexts/stickers/application/add-sticker/StickerAdder';
import { StickerPackCreateMessage } from '@app/contexts/stickers/application/create-pack/messages/StickerPackCreateMessage';
import { StickerPackCreator } from '@app/contexts/stickers/application/create-pack/StickerPackCreator';
import { StickerFavoriteMessage } from '@app/contexts/stickers/application/favorite-sticker/messages/StickerFavoriteMessage';
import { StickerFavoriter } from '@app/contexts/stickers/application/favorite-sticker/StickerFavoriter';
import { StickerUseRecordMessage } from '@app/contexts/stickers/application/record-sticker-use/messages/StickerUseRecordMessage';
import { StickerUseRecorder } from '@app/contexts/stickers/application/record-sticker-use/StickerUseRecorder';
import StickerPackRepository from '@app/contexts/stickers/domain/repositories/StickerPackRepository';
import StickerUserLibraryRepository from '@app/contexts/stickers/domain/repositories/StickerUserLibraryRepository';
import { StickerPack } from '@app/contexts/stickers/domain/StickerPack';
import { StickerUserLibrary } from '@app/contexts/stickers/domain/StickerUserLibrary';
import { StickerPackId } from '@app/contexts/stickers/domain/value-objects/StickerPackId';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

class InMemoryStickerPackRepository implements StickerPackRepository {
  public readonly savedPacks: StickerPack[] = [];

  public async findAll(): Promise<StickerPack[]> {
    return this.savedPacks;
  }

  public async findById(id: StickerPackId): Promise<StickerPack | undefined> {
    return this.savedPacks.find((pack) => pack.getId().isEqual(id));
  }

  public async findByOwner(ownerIdentityId: IdentityId): Promise<StickerPack[]> {
    return this.savedPacks.filter(
      (pack) => pack.toPrimitives().ownerIdentityId === ownerIdentityId.valueOf(),
    );
  }

  public async save(pack: StickerPack): Promise<void> {
    const index = this.savedPacks.findIndex((savedPack) =>
      savedPack.getId().isEqual(pack.getId()),
    );

    if (index >= 0) {
      this.savedPacks[index] = pack;

      return;
    }

    this.savedPacks.push(pack);
  }
}

class InMemoryStickerUserLibraryRepository
  implements StickerUserLibraryRepository
{
  public readonly savedLibraries: StickerUserLibrary[] = [];

  public async findByIdentityId(
    identityId: IdentityId,
  ): Promise<StickerUserLibrary | undefined> {
    return this.savedLibraries.find(
      (library) => library.toPrimitives().identityId === identityId.valueOf(),
    );
  }

  public async save(library: StickerUserLibrary): Promise<void> {
    const index = this.savedLibraries.findIndex(
      (savedLibrary) =>
        savedLibrary.toPrimitives().identityId ===
        library.toPrimitives().identityId,
    );

    if (index >= 0) {
      this.savedLibraries[index] = library;

      return;
    }

    this.savedLibraries.push(library);
  }
}

class SpyDomainEventPublisher implements DomainEventPublisher {
  public readonly publishedEvents: DomainEvent[] = [];

  public async publish(domainEvents: DomainEvent[]): Promise<void> {
    this.publishedEvents.push(...domainEvents);
  }
}

describe('Sticker pack application services', () => {
  const ownerIdentityId =
    'MCowBQYDK2VwAyEAIZERRRhGaokvb3xQqMGr9Y2ble6jUd51OuZRsvW52Q4=';
  const stickerDetails = {
    assetCid: 'bagaaierastickerassetcid',
    contentType: 'image/png',
    dimensions: {
      height: 128,
      width: 128,
    },
    sizeBytes: 32 * 1024,
    type: 'static',
  };
  let packRepository: InMemoryStickerPackRepository;
  let libraryRepository: InMemoryStickerUserLibraryRepository;
  let eventPublisher: SpyDomainEventPublisher;

  beforeEach(() => {
    packRepository = new InMemoryStickerPackRepository();
    libraryRepository = new InMemoryStickerUserLibraryRepository();
    eventPublisher = new SpyDomainEventPublisher();
  });

  it('creates a sticker pack and saves it in the owner library', async () => {
    const pack = await new StickerPackCreator(
      packRepository,
      libraryRepository,
      eventPublisher,
    ).create(new StickerPackCreateMessage(ownerIdentityId, 'Pigeon moods'));
    const library = await libraryRepository.findByIdentityId(
      new IdentityId(ownerIdentityId),
    );

    expect(packRepository.savedPacks).toHaveLength(1);
    expect(library?.toPrimitives().savedPackIds).toEqual([
      pack.getId().valueOf(),
    ]);
    expect(
      eventPublisher.publishedEvents.map((event) => event.eventName()),
    ).toEqual([
      'stickers.v1.pack.was_created',
      'stickers.v1.user_library.was_created',
    ]);
  });

  it('adds, favorites and records sticker use through application messages', async () => {
    const pack = await new StickerPackCreator(
      packRepository,
      libraryRepository,
      eventPublisher,
    ).create(new StickerPackCreateMessage(ownerIdentityId, 'Pigeon moods'));
    const updatedPack = await new StickerAdder(packRepository).add(
      new StickerAddMessage(pack.getId().valueOf(), ownerIdentityId, stickerDetails),
    );
    const stickerId = updatedPack.toPrimitives().stickers[0].id;

    await new StickerFavoriter(packRepository, libraryRepository).favorite(
      new StickerFavoriteMessage(ownerIdentityId, pack.getId().valueOf(), stickerId),
    );
    const library = await new StickerUseRecorder(
      packRepository,
      libraryRepository,
    ).record(
      new StickerUseRecordMessage(ownerIdentityId, pack.getId().valueOf(), stickerId),
    );

    expect(updatedPack.toPrimitives().stickers).toHaveLength(1);
    expect(library.toPrimitives().favoriteStickers).toHaveLength(1);
    expect(library.toPrimitives().recentStickers).toHaveLength(1);
  });
});
