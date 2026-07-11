import { StickerPackForgetMessage } from '@app/contexts/stickers/application/forget-pack/messages/StickerPackForgetMessage';
import StickerPackForgetter from '@app/contexts/stickers/application/forget-pack/StickerPackForgetter';
import { StickerPackSaveMessage } from '@app/contexts/stickers/application/save-pack/messages/StickerPackSaveMessage';
import StickerPackSaver from '@app/contexts/stickers/application/save-pack/StickerPackSaver';
import { StickerUnfavoriteMessage } from '@app/contexts/stickers/application/unfavorite-sticker/messages/StickerUnfavoriteMessage';
import StickerUnfavoriter from '@app/contexts/stickers/application/unfavorite-sticker/StickerUnfavoriter';
import { StickerPackNotFoundError } from '@app/contexts/stickers/domain/errors/StickerPackNotFoundError';
import StickerPackRepository from '@app/contexts/stickers/domain/repositories/StickerPackRepository';
import StickerUserLibraryRepository from '@app/contexts/stickers/domain/repositories/StickerUserLibraryRepository';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { mock } from 'jest-mock-extended';

import { StickerPackMother } from '../../../mothers/StickerPackMother';
import { StickerUserLibraryMother } from '../../../mothers/StickerUserLibraryMother';

describe('Sticker user library application mutations', () => {
  it('StickerPackSaver creates a missing library and publishes its event', async () => {
    const packRepository = mock<StickerPackRepository>();
    const libraryRepository = mock<StickerUserLibraryRepository>();
    const eventPublisher = mock<DomainEventPublisher>();
    const pack = StickerPackMother.create();

    packRepository.findById.mockResolvedValue(pack);
    libraryRepository.findByIdentityId.mockResolvedValue(undefined);

    const library = await new StickerPackSaver(
      packRepository,
      libraryRepository,
      eventPublisher,
    ).save(
      new StickerPackSaveMessage(
        StickerPackMother.ownerIdentityId,
        StickerPackMother.packId,
      ),
    );

    expect(libraryRepository.save).toHaveBeenCalledWith(library);
    expect(eventPublisher.publish).toHaveBeenCalledWith([
      expect.objectContaining({ aggregateId: StickerPackMother.ownerIdentityId }),
    ]);
  });

  it('StickerPackSaver rejects a missing pack before changing a library', async () => {
    const packRepository = mock<StickerPackRepository>();
    const libraryRepository = mock<StickerUserLibraryRepository>();
    const eventPublisher = mock<DomainEventPublisher>();

    packRepository.findById.mockResolvedValue(undefined);

    await expect(
      new StickerPackSaver(
        packRepository,
        libraryRepository,
        eventPublisher,
      ).save(
        new StickerPackSaveMessage(
          StickerPackMother.ownerIdentityId,
          StickerPackMother.packId,
        ),
      ),
    ).rejects.toBeInstanceOf(StickerPackNotFoundError);
    expect(libraryRepository.save).not.toHaveBeenCalled();
  });

  it('StickerPackForgetter removes a saved pack and persists the library', async () => {
    const repository = mock<StickerUserLibraryRepository>();
    const library = StickerUserLibraryMother.create({ savedPack: true });

    repository.findByIdentityId.mockResolvedValue(library);

    const updated = await new StickerPackForgetter(repository).forget(
      new StickerPackForgetMessage(
        StickerPackMother.ownerIdentityId,
        StickerPackMother.packId,
      ),
    );

    expect(updated).toBe(library);
    expect(repository.save).toHaveBeenCalledWith(library);
  });

  it('StickerUnfavoriter removes a favorite and persists the library', async () => {
    const repository = mock<StickerUserLibraryRepository>();
    const library = StickerUserLibraryMother.create({ favoriteSticker: true });

    repository.findByIdentityId.mockResolvedValue(library);

    const updated = await new StickerUnfavoriter(repository).unfavorite(
      new StickerUnfavoriteMessage(
        StickerPackMother.ownerIdentityId,
        StickerPackMother.packId,
        StickerPackMother.stickerId,
      ),
    );

    expect(updated).toBe(library);
    expect(repository.save).toHaveBeenCalledWith(library);
  });
});
