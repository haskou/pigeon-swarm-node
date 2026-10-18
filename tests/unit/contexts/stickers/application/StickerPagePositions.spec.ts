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
  });

  describe('StickerFavoritePosition', () => {
    it('accepts the positions it writes', () => {
      expect(
        StickerFavoritePosition.isValid(StickerFavoritePosition.of(favorite)),
      ).toBe(true);
    });

    it('accepts ids that hold the separator, and keeps them distinct', () => {
      const split = StickerFavoritePosition.of({
        favoritedAt: favorite.favoritedAt,
        packId: 'a|b',
        stickerId: 'c',
      });
      const other = StickerFavoritePosition.of({
        favoritedAt: favorite.favoritedAt,
        packId: 'a',
        stickerId: 'b|c',
      });

      expect(StickerFavoritePosition.isValid(split)).toBe(true);
      expect(StickerFavoritePosition.isValid(other)).toBe(true);
      expect(split).not.toBe(other);
    });

    it('refuses a raw separator inside an id part, a non-canonical escape, and a missing part', () => {
      const timestamp = PageTimestamp.of(favorite.favoritedAt);

      expect(StickerFavoritePosition.isValid(`${timestamp}|a|b|c`)).toBe(false);
      expect(
        StickerFavoritePosition.isValid(`${timestamp}|%70ack|sticker-1`),
      ).toBe(false);
      expect(
        StickerFavoritePosition.isValid(`${timestamp}|sticker-pack-1`),
      ).toBe(false);
      expect(StickerFavoritePosition.isValid(`${timestamp}||sticker-1`)).toBe(
        false,
      );
    });
  });
});
