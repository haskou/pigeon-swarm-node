import { PageSlice } from '@app/contexts/shared/application/pagination/PageSlice';
import { StickerFavoritePosition } from '@app/contexts/stickers/application/find-library/StickerFavoritePosition';
import { StickerPackPosition } from '@app/contexts/stickers/application/find-packs/StickerPackPosition';
import { StickerPack } from '@app/contexts/stickers/domain/StickerPack';
import { StickerUserLibrary } from '@app/contexts/stickers/domain/StickerUserLibrary';

import { StickerLibraryPageRequest } from '../requests/StickerLibraryPageRequest';
import { StickerResource } from '../resources/StickerResource';
import { StickerUserLibraryResource } from '../resources/StickerUserLibraryResource';

type FavoriteEntry = {
  favorite: { favoritedAt: number; packId: string; stickerId: string };
  sticker: StickerResource;
};

export class StickerUserLibraryViewModel {
  constructor(
    private readonly library: StickerUserLibrary,
    private readonly packs: StickerPack[],
    private readonly page: StickerLibraryPageRequest,
  ) {}

  private packById(packId: string): StickerPack | undefined {
    return this.packs.find((pack) => pack.getId().valueOf() === packId);
  }

  private stickerResource(
    packId: string,
    stickerId: string,
  ): StickerResource | undefined {
    const pack = this.packById(packId);

    return pack
      ?.toPrimitives()
      .stickers.find((sticker) => sticker.id === stickerId);
  }

  public toResource(): StickerUserLibraryResource {
    const primitives = this.library.toPrimitives();
    const savedPacks = PageSlice.of({
      after: this.page.savedPacks.after,
      items: primitives.savedPackIds
        .map((packId) => this.packById(packId))
        .filter((pack): pack is StickerPack => pack !== undefined),
      limit: this.page.savedPacks.limit,
      order: 'desc',
      position: (pack) => StickerPackPosition.of(pack),
    });
    const favorites = PageSlice.of<FavoriteEntry>({
      after: this.page.favoriteStickers.after,
      items: primitives.favoriteStickers
        .map((favorite) => ({
          favorite,
          sticker: this.stickerResource(favorite.packId, favorite.stickerId),
        }))
        .filter((entry): entry is FavoriteEntry => entry.sticker !== undefined),
      limit: this.page.favoriteStickers.limit,
      order: 'desc',
      position: ({ favorite }) => StickerFavoritePosition.of(favorite),
    });

    return {
      favoriteStickers: favorites.items.map(({ favorite, sticker }) => ({
        ...favorite,
        sticker,
      })),
      favoriteStickersNextCursor: this.page.nextCursor(
        'favoriteStickers',
        favorites.nextPosition,
      ),
      recentStickers: primitives.recentStickers
        .map((recent) => ({
          ...recent,
          sticker: this.stickerResource(recent.packId, recent.stickerId),
        }))
        .filter((recent) => recent.sticker !== undefined),
      savedPacks: savedPacks.items.map((pack) => pack.toPrimitives()),
      savedPacksNextCursor: this.page.nextCursor(
        'savedPacks',
        savedPacks.nextPosition,
      ),
    };
  }
}
