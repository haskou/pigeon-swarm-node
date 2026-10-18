import { InvalidPageCursorError } from '@app/apps/apis/shared/errors/InvalidPageCursorError';
import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import { PageLimit } from '@app/apps/apis/shared/pagination/PageLimit';
import { StickerFavoritePosition } from '@app/contexts/stickers/application/find-library/StickerFavoritePosition';
import { StickerPackPosition } from '@app/contexts/stickers/application/find-packs/StickerPackPosition';

export type StickerLibraryPageWindow = {
  after: string | undefined;
  limit: number;
};

export type StickerLibraryPageQuery = {
  favoriteStickersCursor?: string;
  favoriteStickersLimit?: unknown;
  savedPacksCursor?: string;
  savedPacksLimit?: unknown;
};

/**
 * The pages of a sticker library's two unbounded arrays, each with its own
 * cursor. Recent stickers are bounded and stay unpaged. Cursors are validated
 * on construction, before the library is read.
 */
export class StickerLibraryPageRequest {
  public readonly favoriteStickers: StickerLibraryPageWindow;
  public readonly savedPacks: StickerLibraryPageWindow;

  private static window(
    name: 'favoriteStickers' | 'savedPacks',
    limit: unknown,
    cursor: string | undefined,
    isValid: (position: string) => boolean,
  ): StickerLibraryPageWindow {
    if (cursor === undefined) {
      return { after: undefined, limit: PageLimit.parse(limit) };
    }

    const position = PageCursor.decode(cursor, `stickers.library.${name}`);

    if (!isValid(position)) throw new InvalidPageCursorError();

    return { after: position, limit: PageLimit.parse(limit) };
  }

  public static first(): StickerLibraryPageRequest {
    return new StickerLibraryPageRequest({});
  }

  constructor(query: StickerLibraryPageQuery) {
    this.savedPacks = StickerLibraryPageRequest.window(
      'savedPacks',
      query.savedPacksLimit,
      query.savedPacksCursor,
      StickerPackPosition.isValid,
    );
    this.favoriteStickers = StickerLibraryPageRequest.window(
      'favoriteStickers',
      query.favoriteStickersLimit,
      query.favoriteStickersCursor,
      StickerFavoritePosition.isValid,
    );
  }

  /** The cursor reading after `nextPosition` in `name`, or null when that list ends. */
  public nextCursor(
    name: 'favoriteStickers' | 'savedPacks',
    nextPosition: string | undefined,
  ): string | null {
    return nextPosition === undefined
      ? null
      : PageCursor.encode({
          position: nextPosition,
          resource: `stickers.library.${name}`,
        });
  }
}
