import { PageSlice } from '@app/contexts/shared/application/pagination/PageSlice';
import { PageTimestamp } from '@app/contexts/shared/application/pagination/PageTimestamp';
import { StickerUserLibraryFindMessage } from '@app/contexts/stickers/application/find-library/messages/StickerUserLibraryFindMessage';
import StickerUserLibraryFinder from '@app/contexts/stickers/application/find-library/StickerUserLibraryFinder';
import { StickerFavoritePosition } from '@app/contexts/stickers/application/find-library/StickerFavoritePosition';
import { StickerPackFindMessage } from '@app/contexts/stickers/application/find-pack/messages/StickerPackFindMessage';
import StickerPackFinder from '@app/contexts/stickers/application/find-pack/StickerPackFinder';
import { StickerPacksFindMessage } from '@app/contexts/stickers/application/find-packs/messages/StickerPacksFindMessage';
import StickerPacksFinder from '@app/contexts/stickers/application/find-packs/StickerPacksFinder';
import { StickerPackPosition } from '@app/contexts/stickers/application/find-packs/StickerPackPosition';
import { StickerPackNotFoundError } from '@app/contexts/stickers/domain/errors/StickerPackNotFoundError';
import StickerPackRepository from '@app/contexts/stickers/domain/repositories/StickerPackRepository';
import StickerUserLibraryRepository from '@app/contexts/stickers/domain/repositories/StickerUserLibraryRepository';
import { StickerPack } from '@app/contexts/stickers/domain/StickerPack';
import { StickerUserLibrary } from '@app/contexts/stickers/domain/StickerUserLibrary';
import { mock } from 'jest-mock-extended';

import { StickerPackMother } from '../../../mothers/StickerPackMother';
import { StickerUserLibraryMother } from '../../../mothers/StickerUserLibraryMother';

describe('Sticker application queries', () => {
  /** Packs with one shared `updatedAt`, so only the id orders them. */
  const tiedPacks = (ids: string[]): StickerPack[] =>
    ids.map((id) =>
      StickerPack.fromPrimitives({
        ...StickerPackMother.create().toPrimitives(),
        id,
        updatedAt: 1780000000000,
      }),
    );

  /** Walks every page at `limit`, asserting each cursor advances. */
  const walkPacks = async (
    repository: StickerPackRepository,
    limit: number,
  ): Promise<string[]> => {
    const finder = new StickerPacksFinder(repository);
    const seen: string[] = [];
    let after: string | undefined;

    do {
      const page = await finder.find(
        new StickerPacksFindMessage(undefined, limit, after),
      );

      seen.push(...page.items.map((pack) => pack.toPrimitives().id));
      after = page.nextPosition;
    } while (after !== undefined);

    return seen;
  };

  it('StickerPackFinder returns the requested pack', async () => {
    const repository = mock<StickerPackRepository>();
    const pack = StickerPackMother.create();

    repository.requireById.mockResolvedValue(pack);

    await expect(
      new StickerPackFinder(repository).find(
        new StickerPackFindMessage(StickerPackMother.packId),
      ),
    ).resolves.toBe(pack);
  });

  it('StickerPackFinder rejects a missing pack', async () => {
    const repository = mock<StickerPackRepository>();

    repository.requireById.mockRejectedValue(new StickerPackNotFoundError());

    await expect(
      new StickerPackFinder(repository).find(
        new StickerPackFindMessage(StickerPackMother.packId),
      ),
    ).rejects.toBeInstanceOf(StickerPackNotFoundError);
  });

  it('StickerPacksFinder filters by owner when requested', async () => {
    const repository = mock<StickerPackRepository>();
    const packs = [StickerPackMother.create()];

    repository.findByOwner.mockResolvedValue(packs);

    const page = await new StickerPacksFinder(repository).find(
      new StickerPacksFindMessage(
        StickerPackMother.ownerIdentityId,
        50,
        undefined,
      ),
    );

    expect(page.items).toEqual(packs);
    expect(repository.findAll).not.toHaveBeenCalled();
  });

  it('StickerPacksFinder lists every pack without an owner filter', async () => {
    const repository = mock<StickerPackRepository>();
    const packs = [StickerPackMother.create()];

    repository.findAll.mockResolvedValue(packs);

    const page = await new StickerPacksFinder(repository).find(
      new StickerPacksFindMessage(undefined, 50, undefined),
    );

    expect(page.items).toEqual(packs);
    expect(repository.findByOwner).not.toHaveBeenCalled();
  });

  it('StickerPacksFinder pages packs, most recently updated first', async () => {
    const repository = mock<StickerPackRepository>();
    const older = StickerPackMother.create();
    const newer = StickerPack.fromPrimitives({
      ...older.toPrimitives(),
      id: 'sticker-pack-2',
      updatedAt: 1780000000005,
    });

    repository.findAll.mockResolvedValue([older, newer]);

    const first = await new StickerPacksFinder(repository).find(
      new StickerPacksFindMessage(undefined, 1, undefined),
    );

    expect(first.items).toEqual([newer]);
    expect(first.nextPosition).toBeDefined();

    const second = await new StickerPacksFinder(repository).find(
      new StickerPacksFindMessage(undefined, 1, first.nextPosition),
    );

    expect(second.items).toEqual([older]);
  });

  it('StickerPacksFinder walks tied packs at limit 1 with no gaps or repeats', async () => {
    const repository = mock<StickerPackRepository>();

    repository.findAll.mockResolvedValue(
      tiedPacks(['pack-b', 'pack-c', 'pack-a']),
    );

    // Ties break by id, descending: the position is `timestamp|id`.
    await expect(walkPacks(repository, 1)).resolves.toEqual([
      'pack-c',
      'pack-b',
      'pack-a',
    ]);
  });

  it('StickerPacksFinder walks every page at limit 2 without repeats', async () => {
    const repository = mock<StickerPackRepository>();

    repository.findAll.mockResolvedValue(
      tiedPacks(['pack-1', 'pack-2', 'pack-3', 'pack-4', 'pack-5']),
    );

    await expect(walkPacks(repository, 2)).resolves.toEqual([
      'pack-5',
      'pack-4',
      'pack-3',
      'pack-2',
      'pack-1',
    ]);
  });

  it('StickerPacksFinder resumes after a position that matches no pack', async () => {
    const repository = mock<StickerPackRepository>();

    repository.findAll.mockResolvedValue(tiedPacks(['pack-a', 'pack-c']));

    // Between `pack-c` and `pack-a` in descending order: only `pack-a` follows.
    const between = `${PageTimestamp.of(1780000000000)}|pack-b`;
    const page = await new StickerPacksFinder(repository).find(
      new StickerPacksFindMessage(undefined, 10, between),
    );

    expect(page.items.map((pack) => pack.toPrimitives().id)).toEqual([
      'pack-a',
    ]);
    expect(page.nextPosition).toBeUndefined();
    expect(StickerPackPosition.isValid(between)).toBe(true);
  });

  it('StickerUserLibraryFinder returns an existing library', async () => {
    const repository = mock<StickerUserLibraryRepository>();
    const library = StickerUserLibraryMother.create();

    repository.hasByIdentityId.mockResolvedValue(true);
    repository.requireByIdentityId.mockResolvedValue(library);

    await expect(
      new StickerUserLibraryFinder(repository).find(
        new StickerUserLibraryFindMessage(StickerPackMother.ownerIdentityId),
      ),
    ).resolves.toBe(library);
  });

  it('StickerUserLibraryFinder creates an empty missing library', async () => {
    const repository = mock<StickerUserLibraryRepository>();

    repository.hasByIdentityId.mockResolvedValue(false);

    const library = await new StickerUserLibraryFinder(repository).find(
      new StickerUserLibraryFindMessage(StickerPackMother.ownerIdentityId),
    );

    expect(library).toBeInstanceOf(StickerUserLibrary);
    expect(library.pullDomainEvents()).toEqual([
      expect.objectContaining({
        aggregateId: StickerPackMother.ownerIdentityId,
      }),
    ]);
  });

  it('favorites walk at limit 1 in favoritedAt order, ties broken by pack then sticker id', () => {
    const favorites = [
      { favoritedAt: 1780000000000, packId: 'pack-a', stickerId: 'sticker-b' },
      { favoritedAt: 1780000000000, packId: 'pack-a', stickerId: 'sticker-a' },
      { favoritedAt: 1780000000005, packId: 'pack-b', stickerId: 'sticker-z' },
    ];
    const positioned = favorites.map((favorite) => ({
      favorite,
      position: StickerFavoritePosition.of(favorite),
    }));
    const seen: string[] = [];
    let after: string | undefined;

    for (;;) {
      const page = PageSlice.of({
        after,
        items: positioned,
        limit: 1,
        order: 'desc',
        position: (item) => item.position,
      });

      seen.push(...page.items.map(({ favorite }) => favorite.stickerId));
      if (page.nextPosition === undefined) break;
      after = page.nextPosition;
    }

    expect(seen).toEqual(['sticker-z', 'sticker-b', 'sticker-a']);
  });
});
