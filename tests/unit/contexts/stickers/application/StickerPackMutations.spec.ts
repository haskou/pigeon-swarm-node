import { StickerDeleteMessage } from '@app/contexts/stickers/application/delete-sticker/messages/StickerDeleteMessage';
import StickerDeleter from '@app/contexts/stickers/application/delete-sticker/StickerDeleter';
import { StickerPackUpdateMessage } from '@app/contexts/stickers/application/update-pack/messages/StickerPackUpdateMessage';
import StickerPackUpdater from '@app/contexts/stickers/application/update-pack/StickerPackUpdater';
import { StickerUpdateMessage } from '@app/contexts/stickers/application/update-sticker/messages/StickerUpdateMessage';
import StickerUpdater from '@app/contexts/stickers/application/update-sticker/StickerUpdater';
import { StickerNotFoundError } from '@app/contexts/stickers/domain/errors/StickerNotFoundError';
import { StickerPackNotFoundError } from '@app/contexts/stickers/domain/errors/StickerPackNotFoundError';
import StickerPackRepository from '@app/contexts/stickers/domain/repositories/StickerPackRepository';
import { mock } from 'jest-mock-extended';

import { StickerPackMother } from '../../../mothers/StickerPackMother';

const updatedStickerDetails = {
  assetCid: 'bagaaieraupdatedstickerassetcid',
  contentType: 'image/webp',
  dimensions: { height: 256, width: 256 },
  sizeBytes: 48 * 1024,
  type: 'static',
};

describe('Sticker pack application mutations', () => {
  it('StickerPackUpdater changes the pack profile and persists it', async () => {
    const repository = mock<StickerPackRepository>();
    const pack = StickerPackMother.create();

    repository.findById.mockResolvedValue(pack);

    const updated = await new StickerPackUpdater(repository).update(
      new StickerPackUpdateMessage(
        StickerPackMother.packId,
        StickerPackMother.ownerIdentityId,
        'Updated pigeon moods',
      ),
    );

    expect(updated).toBe(pack);
    expect(repository.save).toHaveBeenCalledWith(pack);
  });

  it('StickerPackUpdater rejects a missing pack', async () => {
    const repository = mock<StickerPackRepository>();

    repository.findById.mockResolvedValue(undefined);

    await expect(
      new StickerPackUpdater(repository).update(
        new StickerPackUpdateMessage(
          StickerPackMother.packId,
          StickerPackMother.ownerIdentityId,
          'Updated pigeon moods',
        ),
      ),
    ).rejects.toBeInstanceOf(StickerPackNotFoundError);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('StickerUpdater changes sticker metadata and persists the pack', async () => {
    const repository = mock<StickerPackRepository>();
    const pack = StickerPackMother.create({ withSticker: true });

    repository.findById.mockResolvedValue(pack);

    const updated = await new StickerUpdater(repository).update(
      new StickerUpdateMessage(
        StickerPackMother.packId,
        StickerPackMother.stickerId,
        StickerPackMother.ownerIdentityId,
        updatedStickerDetails,
      ),
    );

    expect(updated).toBe(pack);
    expect(repository.save).toHaveBeenCalledWith(pack);
  });

  it('StickerUpdater rejects a missing sticker without persisting', async () => {
    const repository = mock<StickerPackRepository>();
    const pack = StickerPackMother.create();

    repository.findById.mockResolvedValue(pack);

    await expect(
      new StickerUpdater(repository).update(
        new StickerUpdateMessage(
          StickerPackMother.packId,
          StickerPackMother.stickerId,
          StickerPackMother.ownerIdentityId,
          updatedStickerDetails,
        ),
      ),
    ).rejects.toBeInstanceOf(StickerNotFoundError);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('StickerDeleter removes a sticker and persists the pack', async () => {
    const repository = mock<StickerPackRepository>();
    const pack = StickerPackMother.create({ withSticker: true });

    repository.findById.mockResolvedValue(pack);

    const updated = await new StickerDeleter(repository).delete(
      new StickerDeleteMessage(
        StickerPackMother.packId,
        StickerPackMother.stickerId,
        StickerPackMother.ownerIdentityId,
      ),
    );

    expect(updated).toBe(pack);
    expect(repository.save).toHaveBeenCalledWith(pack);
  });

  it('StickerDeleter rejects a missing sticker without persisting', async () => {
    const repository = mock<StickerPackRepository>();
    const pack = StickerPackMother.create();

    repository.findById.mockResolvedValue(pack);

    await expect(
      new StickerDeleter(repository).delete(
        new StickerDeleteMessage(
          StickerPackMother.packId,
          StickerPackMother.stickerId,
          StickerPackMother.ownerIdentityId,
        ),
      ),
    ).rejects.toBeInstanceOf(StickerNotFoundError);
    expect(repository.save).not.toHaveBeenCalled();
  });
});
