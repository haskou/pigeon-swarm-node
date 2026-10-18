import { PageTimestamp } from '@app/contexts/shared/application/pagination/PageTimestamp';

import { StickerPack } from '../../domain/StickerPack';
import { StickerPackId } from '../../domain/value-objects/StickerPackId';

/**
 * The page position of a sticker pack: when it was last updated, then its id,
 * so packs updated in the same millisecond keep a stable order. Most recently
 * updated first.
 */
export class StickerPackPosition {
  private static readonly SEPARATOR = '|';

  public static of(pack: StickerPack): string {
    const { id, updatedAt } = pack.toPrimitives();

    return `${PageTimestamp.of(updatedAt)}${StickerPackPosition.SEPARATOR}${id}`;
  }

  /** Whether `position` is one `of` could have produced. */
  public static isValid(position: string): boolean {
    const separator = position.indexOf(StickerPackPosition.SEPARATOR);

    if (separator === -1 || separator === position.length - 1) return false;

    try {
      new StickerPackId(position.slice(separator + 1));
    } catch {
      return false;
    }

    return PageTimestamp.isValid(position.slice(0, separator));
  }
}
