import { StickerUserLibraryFindMessage } from '@app/contexts/stickers/application/find-library/messages/StickerUserLibraryFindMessage';
import StickerUserLibraryFinder from '@app/contexts/stickers/application/find-library/StickerUserLibraryFinder';
import { StickerPackFindMessage } from '@app/contexts/stickers/application/find-pack/messages/StickerPackFindMessage';
import StickerPackFinder from '@app/contexts/stickers/application/find-pack/StickerPackFinder';
import { StickerPacksFindMessage } from '@app/contexts/stickers/application/find-packs/messages/StickerPacksFindMessage';
import StickerPacksFinder from '@app/contexts/stickers/application/find-packs/StickerPacksFinder';
import { StickerPackNotFoundError } from '@app/contexts/stickers/domain/errors/StickerPackNotFoundError';
import StickerPackRepository from '@app/contexts/stickers/domain/repositories/StickerPackRepository';
import StickerUserLibraryRepository from '@app/contexts/stickers/domain/repositories/StickerUserLibraryRepository';
import { StickerUserLibrary } from '@app/contexts/stickers/domain/StickerUserLibrary';
import { mock } from 'jest-mock-extended';

import { StickerPackMother } from '../../../mothers/StickerPackMother';
import { StickerUserLibraryMother } from '../../../mothers/StickerUserLibraryMother';

describe('Sticker application queries', () => {
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

    await expect(
      new StickerPacksFinder(repository).find(
        new StickerPacksFindMessage(StickerPackMother.ownerIdentityId),
      ),
    ).resolves.toBe(packs);
    expect(repository.findAll).not.toHaveBeenCalled();
  });

  it('StickerPacksFinder lists every pack without an owner filter', async () => {
    const repository = mock<StickerPackRepository>();
    const packs = [StickerPackMother.create()];

    repository.findAll.mockResolvedValue(packs);

    await expect(
      new StickerPacksFinder(repository).find(new StickerPacksFindMessage()),
    ).resolves.toBe(packs);
    expect(repository.findByOwner).not.toHaveBeenCalled();
  });

  it('StickerUserLibraryFinder returns an existing library', async () => {
    const repository = mock<StickerUserLibraryRepository>();
    const library = StickerUserLibraryMother.create();

    repository.hasByIdentityId.mockResolvedValue(true);
    repository.requireByIdentityId.mockResolvedValue(library);

    await expect(
      new StickerUserLibraryFinder(repository).find(
        new StickerUserLibraryFindMessage(
          StickerPackMother.ownerIdentityId,
        ),
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
      expect.objectContaining({ aggregateId: StickerPackMother.ownerIdentityId }),
    ]);
  });
});
