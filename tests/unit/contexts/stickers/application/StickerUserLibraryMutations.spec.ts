import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { StickerId } from '@app/contexts/stickers/domain/value-objects/StickerId';
import { StickerPackId } from '@app/contexts/stickers/domain/value-objects/StickerPackId';
import { Timestamp } from '@haskou/value-objects';
import { StickerPackForgetMessage } from '@app/contexts/stickers/application/forget-pack/messages/StickerPackForgetMessage';
import StickerPackForgetter from '@app/contexts/stickers/application/forget-pack/StickerPackForgetter';
import { StickerPackSaveMessage } from '@app/contexts/stickers/application/save-pack/messages/StickerPackSaveMessage';
import StickerPackSaver from '@app/contexts/stickers/application/save-pack/StickerPackSaver';
import { StickerUnfavoriteMessage } from '@app/contexts/stickers/application/unfavorite-sticker/messages/StickerUnfavoriteMessage';
import StickerUnfavoriter from '@app/contexts/stickers/application/unfavorite-sticker/StickerUnfavoriter';
import { StickerPackNotFoundError } from '@app/contexts/stickers/domain/errors/StickerPackNotFoundError';
import StickerPackRepository from '@app/contexts/stickers/domain/repositories/StickerPackRepository';
import StickerUserLibraryRepository from '@app/contexts/stickers/domain/repositories/StickerUserLibraryRepository';
import { StickerUserLibrary } from '@app/contexts/stickers/domain/StickerUserLibrary';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { mock } from 'jest-mock-extended';

import { StickerMutationMother } from '../../../mothers/StickerMutationMother';
import { StickerPackMother } from '../../../mothers/StickerPackMother';
import { StickerUserLibraryMother } from '../../../mothers/StickerUserLibraryMother';

describe('Sticker user library application mutations', () => {
  const savedAt = 1780000100000;
  let mutation: Awaited<ReturnType<typeof StickerMutationMother.create>>;

  beforeAll(async () => {
    mutation = await StickerMutationMother.create('stickerUserLibraries');
  });

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
        savedAt,
        mutation,
      ),
    );

    expect(libraryRepository.savePack).toHaveBeenCalledWith(
      new IdentityId(StickerPackMother.ownerIdentityId),
      new StickerPackId(StickerPackMother.packId),
      new Timestamp(savedAt),
      expect.any(PublicMutationProof),
    );
    expect(library).toBeInstanceOf(StickerUserLibrary);
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
          savedAt,
          mutation,
        ),
      ),
    ).rejects.toBeInstanceOf(StickerPackNotFoundError);
    expect(libraryRepository.savePack).not.toHaveBeenCalled();
  });

  it('StickerPackForgetter removes a saved pack and persists the library', async () => {
    const repository = mock<StickerUserLibraryRepository>();
    const library = StickerUserLibraryMother.create({ savedPack: true });

    repository.findByIdentityId.mockResolvedValue(library);

    const updated = await new StickerPackForgetter(repository).forget(
      new StickerPackForgetMessage(
        StickerPackMother.ownerIdentityId,
        StickerPackMother.packId,
        mutation,
      ),
    );

    expect(updated).toBe(library);
    expect(repository.forgetPack).toHaveBeenCalledWith(
      new IdentityId(StickerPackMother.ownerIdentityId),
      new StickerPackId(StickerPackMother.packId),
      expect.any(PublicMutationProof),
    );
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
        mutation,
      ),
    );

    expect(updated).toBe(library);
    expect(repository.unfavorite).toHaveBeenCalledWith(
      new IdentityId(StickerPackMother.ownerIdentityId),
      new StickerPackId(StickerPackMother.packId),
      new StickerId(StickerPackMother.stickerId),
      expect.any(PublicMutationProof),
    );
  });
});
