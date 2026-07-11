import { StickerUserLibrary } from '@app/contexts/stickers/domain/StickerUserLibrary';

import { StickerPackMother } from './StickerPackMother';

export class StickerUserLibraryMother {
  public static create(options: {
    favoriteSticker?: boolean;
    savedPack?: boolean;
  } = {}): StickerUserLibrary {
    return StickerUserLibrary.fromPrimitives({
      favoriteStickers: options.favoriteSticker
        ? [
            {
              favoritedAt: 1780000000000,
              packId: StickerPackMother.packId,
              stickerId: StickerPackMother.stickerId,
            },
          ]
        : [],
      identityId: StickerPackMother.ownerIdentityId,
      recentStickers: [],
      savedPackIds: options.savedPack ? [StickerPackMother.packId] : [],
    });
  }
}
