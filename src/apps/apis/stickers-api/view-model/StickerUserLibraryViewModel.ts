import { StickerPack } from '@app/contexts/stickers/domain/StickerPack';
import { StickerUserLibrary } from '@app/contexts/stickers/domain/StickerUserLibrary';

import { StickerUserLibraryResource } from '../resources/StickerUserLibraryResource';

export class StickerUserLibraryViewModel {
  constructor(
    private readonly library: StickerUserLibrary,
    private readonly packs: StickerPack[],
  ) {}

  private packById(packId: string): StickerPack | undefined {
    return this.packs.find((pack) => pack.getId().valueOf() === packId);
  }

  private stickerResource(packId: string, stickerId: string) {
    const pack = this.packById(packId);

    return pack
      ?.toPrimitives()
      .stickers.find((sticker) => sticker.id === stickerId);
  }

  public toResource(): StickerUserLibraryResource {
    const primitives = this.library.toPrimitives();
    const savedPacks = primitives.savedPackIds
      .map((packId) => this.packById(packId)?.toPrimitives())
      .filter((pack) => pack !== undefined);

    return {
      favoriteStickers: primitives.favoriteStickers
        .map((favorite) => ({
          ...favorite,
          sticker: this.stickerResource(favorite.packId, favorite.stickerId),
        }))
        .filter((favorite) => favorite.sticker !== undefined),
      recentStickers: primitives.recentStickers
        .map((recent) => ({
          ...recent,
          sticker: this.stickerResource(recent.packId, recent.stickerId),
        }))
        .filter((recent) => recent.sticker !== undefined),
      savedPacks,
    };
  }
}
