import { PageTimestamp } from '@app/contexts/shared/application/pagination/PageTimestamp';
import { StickerFavoritePosition } from '@app/contexts/stickers/application/find-library/StickerFavoritePosition';
import { StickerPackPosition } from '@app/contexts/stickers/application/find-packs/StickerPackPosition';

import { StickerPackMother } from '../../../mothers/StickerPackMother';

describe('Sticker page positions', () => {
  const favorite = {
    favoritedAt: 1780000000000,
    packId: StickerPackMother.packId,
    stickerId: StickerPackMother.stickerId,
  };

  describe('StickerPackPosition', () => {
    it('accepts the positions it writes', () => {
      const pack = StickerPackMother.create();

      expect(StickerPackPosition.of(pack)).toBe(
        `${PageTimestamp.of(1780000000000)}|${StickerPackMother.packId}`,
      );
      expect(StickerPackPosition.isValid(StickerPackPosition.of(pack))).toBe(
        true,
      );
    });

    it('refuses a position with no separator, an empty id, or a bad timestamp', () => {
      const timestamp = PageTimestamp.of(1780000000000);

      expect(StickerPackPosition.isValid(timestamp)).toBe(false);
      expect(StickerPackPosition.isValid(`${timestamp}|`)).toBe(false);
      expect(
        StickerPackPosition.isValid(`garbage|${StickerPackMother.packId}`),
      ).toBe(false);
    });

    it('refuses an id outside the id rule, however long the position', () => {
      const timestamp = PageTimestamp.of(1780000000000);

      expect(StickerPackPosition.isValid(`${timestamp}|a|b`)).toBe(false);
      expect(
        StickerPackPosition.isValid(`${timestamp}|${'a'.repeat(33)}`),
      ).toBe(false);
    });
  });

  describe('StickerFavoritePosition', () => {
    it('accepts the positions it writes', () => {
      expect(
        StickerFavoritePosition.isValid(StickerFavoritePosition.of(favorite)),
      ).toBe(true);
    });

    it('keeps the longest possible position under the 256-character cap', () => {
      const longest = StickerFavoritePosition.of({
        favoritedAt: favorite.favoritedAt,
        packId: 'a'.repeat(32),
        stickerId: 'b'.repeat(32),
      });

      expect(longest.length).toBe(83);
      expect(StickerFavoritePosition.isValid(longest)).toBe(true);
    });

    it('refuses an id that is too long, holds a separator, or uses a non-ASCII letter', () => {
      const timestamp = PageTimestamp.of(favorite.favoritedAt);

      expect(
        StickerFavoritePosition.isValid(`${timestamp}|${'a'.repeat(33)}|b`),
      ).toBe(false);
      expect(StickerFavoritePosition.isValid(`${timestamp}|a|b|c`)).toBe(false);
      expect(StickerFavoritePosition.isValid(`${timestamp}|a%7Cb|c`)).toBe(
        false,
      );
      expect(StickerFavoritePosition.isValid(`${timestamp}|é|c`)).toBe(false);
    });

    it('refuses a missing id part and a bad timestamp', () => {
      const timestamp = PageTimestamp.of(favorite.favoritedAt);

      expect(
        StickerFavoritePosition.isValid(`${timestamp}|sticker-pack-1`),
      ).toBe(false);
      expect(StickerFavoritePosition.isValid(`${timestamp}||sticker-1`)).toBe(
        false,
      );
      expect(
        StickerFavoritePosition.isValid(`garbage|sticker-pack-1|sticker-1`),
      ).toBe(false);
    });
  });
});
