import { PageTimestamp } from '@app/contexts/shared/application/pagination/PageTimestamp';

import { StickerId } from '../../domain/value-objects/StickerId';
import { StickerPackId } from '../../domain/value-objects/StickerPackId';

/**
 * The page position of a favorite sticker: when it was favorited, then its
 * pack and sticker ids. Most recently favorited first. Ids are client-chosen
 * and may hold the separator, so each one is percent-encoded: the encoding
 * never contains the separator and is injective, so positions stay unique.
 */
export class StickerFavoritePosition {
  private static readonly SEPARATOR = '|';

  /** An id part is valid only in the exact form `of` writes, and names a valid id. */
  private static isValidId(
    part: string,
    build: (id: string) => unknown,
  ): boolean {
    if (part === '') return false;

    try {
      const id = decodeURIComponent(part);

      build(id);

      return encodeURIComponent(id) === part;
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
      encodeURIComponent(favorite.packId),
      encodeURIComponent(favorite.stickerId),
    ].join(StickerFavoritePosition.SEPARATOR);
  }

  /** Whether `position` is one `of` could have produced. */
  public static isValid(position: string): boolean {
    const [timestamp = '', packPart = '', stickerPart = '', ...rest] =
      position.split(StickerFavoritePosition.SEPARATOR);

    if (rest.length > 0 || !PageTimestamp.isValid(timestamp)) return false;

    return (
      StickerFavoritePosition.isValidId(
        packPart,
        (id) => new StickerPackId(id),
      ) &&
      StickerFavoritePosition.isValidId(stickerPart, (id) => new StickerId(id))
    );
  }
}
