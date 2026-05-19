import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { StickerUserLibrary } from '@app/contexts/stickers/domain/StickerUserLibrary';
import { StickerId } from '@app/contexts/stickers/domain/value-objects/StickerId';
import { StickerPackId } from '@app/contexts/stickers/domain/value-objects/StickerPackId';

describe('StickerUserLibrary', () => {
  const identityId = new IdentityId(
    'MCowBQYDK2VwAyEAIZERRRhGaokvb3xQqMGr9Y2ble6jUd51OuZRsvW52Q4=',
  );

  it('saves each sticker pack only once', () => {
    const library = StickerUserLibrary.create(identityId);
    const packId = StickerPackId.generate();

    library.savePack(packId);
    library.savePack(packId);

    expect(library.toPrimitives().savedPackIds).toEqual([packId.valueOf()]);
  });

  it('favorites and unfavorites stickers', () => {
    const library = StickerUserLibrary.create(identityId);
    const packId = StickerPackId.generate();
    const stickerId = StickerId.generate();

    library.favoriteSticker(packId, stickerId);
    library.favoriteSticker(packId, stickerId);
    library.unfavoriteSticker(packId, stickerId);

    expect(library.toPrimitives().favoriteStickers).toEqual([]);
  });

  it('keeps at most ten recent stickers', () => {
    const library = StickerUserLibrary.create(identityId);

    for (let index = 0; index < 12; index += 1) {
      library.recordStickerUse(StickerPackId.generate(), StickerId.generate());
    }

    expect(library.toPrimitives().recentStickers).toHaveLength(10);
  });
});
