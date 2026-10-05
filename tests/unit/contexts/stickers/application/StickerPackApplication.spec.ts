import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { StickerAddMessage } from '@app/contexts/stickers/application/add-sticker/messages/StickerAddMessage';
import StickerAdder from '@app/contexts/stickers/application/add-sticker/StickerAdder';
import { StickerPackCreateMessage } from '@app/contexts/stickers/application/create-pack/messages/StickerPackCreateMessage';
import StickerPackCreator from '@app/contexts/stickers/application/create-pack/StickerPackCreator';
import { StickerFavoriteMessage } from '@app/contexts/stickers/application/favorite-sticker/messages/StickerFavoriteMessage';
import StickerFavoriter from '@app/contexts/stickers/application/favorite-sticker/StickerFavoriter';
import { StickerUseRecordMessage } from '@app/contexts/stickers/application/record-sticker-use/messages/StickerUseRecordMessage';
import StickerUseRecorder from '@app/contexts/stickers/application/record-sticker-use/StickerUseRecorder';
import StickerPackRepository from '@app/contexts/stickers/domain/repositories/StickerPackRepository';
import StickerUserLibraryRepository from '@app/contexts/stickers/domain/repositories/StickerUserLibraryRepository';
import { StickerPack } from '@app/contexts/stickers/domain/StickerPack';
import { StickerUserLibrary } from '@app/contexts/stickers/domain/StickerUserLibrary';
import { StickerPackId } from '@app/contexts/stickers/domain/value-objects/StickerPackId';
import { StickerId } from '@app/contexts/stickers/domain/value-objects/StickerId';
import { Timestamp } from '@haskou/value-objects';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { DomainEventPublisher } from '@haskou/ddd-kernel/domain';

import { StickerMutationMother } from '../../../mothers/StickerMutationMother';

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
  public readonly favorites = new Set<string>();
  public readonly recents = new Map<string, number>();
  public readonly savedPacks = new Set<string>();
  public touched = false;

  public async favorite(
    _identityId: IdentityId,
    packId: StickerPackId,
    stickerId: StickerId,
  ): Promise<void> {
    this.touched = true;
    this.favorites.add(`${packId.valueOf()}:${stickerId.valueOf()}`);
  }

  public async findByIdentityId(
    identityId: IdentityId,
  ): Promise<StickerUserLibrary | undefined> {
    if (!this.touched) {
      return undefined;
    }

    return StickerUserLibrary.fromPrimitives({
      favoriteStickers: [...this.favorites].map((key) => {
        const [packId, stickerId] = key.split(':');

        return { favoritedAt: 1780000000000, packId, stickerId };
      }),
      identityId: identityId.valueOf(),
      recentStickers: [...this.recents].map(([key, usedAt]) => {
        const [packId, stickerId] = key.split(':');

        return { packId, stickerId, usedAt };
      }),
      savedPackIds: [...this.savedPacks],
    });
  }

  public async forgetPack(
    _identityId: IdentityId,
    packId: StickerPackId,
  ): Promise<void> {
    this.savedPacks.delete(packId.valueOf());
  }

  public async recordUse(
    _identityId: IdentityId,
    packId: StickerPackId,
    stickerId: StickerId,
    usedAt: Timestamp,
  ): Promise<void> {
    this.touched = true;
    this.recents.set(
      `${packId.valueOf()}:${stickerId.valueOf()}`,
      usedAt.valueOf(),
    );
  }

  public async savePack(
    _identityId: IdentityId,
    packId: StickerPackId,
  ): Promise<void> {
    this.touched = true;
    this.savedPacks.add(packId.valueOf());
  }

  public async unfavorite(
    _identityId: IdentityId,
    packId: StickerPackId,
    stickerId: StickerId,
  ): Promise<void> {
    this.favorites.delete(`${packId.valueOf()}:${stickerId.valueOf()}`);
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
  const createdAt = 1780000000000;
  const packId = 'sticker-pack-1';
  const stickerId = 'sticker-1';
  let mutation: Awaited<ReturnType<typeof StickerMutationMother.create>>;
  let packRepository: InMemoryStickerPackRepository;
  let libraryRepository: InMemoryStickerUserLibraryRepository;
  let eventPublisher: SpyDomainEventPublisher;

  beforeAll(async () => {
    mutation = await StickerMutationMother.create();
  });

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
    ).create(
      new StickerPackCreateMessage(
        ownerIdentityId,
        packId,
        'Pigeon moods',
        createdAt,
        mutation,
        mutation,
      ),
    );
    const library = await libraryRepository.findByIdentityId(
      new IdentityId(ownerIdentityId),
    );

    expect(packRepository.savedPacks).toHaveLength(1);
    expect(pack.getId().valueOf()).toBe(packId);
    expect(pack.toPrimitives().createdAt).toBe(createdAt);
    expect(library?.toPrimitives().savedPackIds).toEqual([packId]);
    expect(
      eventPublisher.publishedEvents.map((event) => event.eventName()),
    ).toEqual([
      'stickers.v1.pack.was_created',
      'stickers.v1.user_library.was_created',
    ]);
  });

  it('adds, favorites and records sticker use through application messages', async () => {
    await new StickerPackCreator(
      packRepository,
      libraryRepository,
      eventPublisher,
    ).create(
      new StickerPackCreateMessage(
        ownerIdentityId,
        packId,
        'Pigeon moods',
        createdAt,
        mutation,
        mutation,
      ),
    );
    const updatedPack = await new StickerAdder(packRepository).add(
      new StickerAddMessage(
        packId,
        ownerIdentityId,
        stickerDetails,
        stickerId,
        createdAt + 1,
        mutation,
      ),
    );

    await new StickerFavoriter(packRepository, libraryRepository).favorite(
      new StickerFavoriteMessage(
        ownerIdentityId,
        packId,
        stickerId,
        createdAt + 2,
        mutation,
      ),
    );
    const library = await new StickerUseRecorder(
      packRepository,
      libraryRepository,
    ).record(
      new StickerUseRecordMessage(
        ownerIdentityId,
        packId,
        stickerId,
        createdAt + 3,
        mutation,
      ),
    );

    expect(updatedPack.toPrimitives().stickers).toHaveLength(1);
    expect(library.toPrimitives().favoriteStickers).toHaveLength(1);
    expect(library.toPrimitives().recentStickers).toHaveLength(1);
  });
});

