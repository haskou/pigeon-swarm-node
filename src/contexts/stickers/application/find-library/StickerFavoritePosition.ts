import { PageTimestamp } from '@app/contexts/shared/application/pagination/PageTimestamp';

import { StickerId } from '../../domain/value-objects/StickerId';
import { StickerPackId } from '../../domain/value-objects/StickerPackId';

/**
 * The page position of a favorite sticker: when it was favorited, then its
 * pack and sticker ids. Most recently favorited first. Ids are limited to
 * ASCII letters, digits, `-` and `_` (see StickerId), so they never hold the
 * separator and need no escaping. The longest position is 83 characters.
 */
export class StickerFavoritePosition {
  private static readonly SEPARATOR = '|';

  /** Whether `id` names a valid id of `build`'s value object. */
  private static isId(id: string, build: (value: string) => unknown): boolean {
    try {
      build(id);

      return true;
    } catch {
      return false;
    }
  }

  public static of(favorite: {
    favoritedAt: number;
    packId: string;
    stickerId: string;
  }): string {
    return [
      PageTimestamp.of(favorite.favoritedAt),
      favorite.packId,
      favorite.stickerId,
    ].join(StickerFavoritePosition.SEPARATOR);
  }

  /** Whether `position` is one `of` could have produced. */
  public static isValid(position: string): boolean {
    const [timestamp = '', packId = '', stickerId = '', ...rest] =
      position.split(StickerFavoritePosition.SEPARATOR);

    if (rest.length > 0 || !PageTimestamp.isValid(timestamp)) return false;

    return (
      StickerFavoritePosition.isId(packId, (id) => new StickerPackId(id)) &&
      StickerFavoritePosition.isId(stickerId, (id) => new StickerId(id))
    );
  }
}
