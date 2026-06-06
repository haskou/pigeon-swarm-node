import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import AggregateRoot from '@app/shared/domain/AggregateRoot';
import { PrimitiveOf } from '@haskou/value-objects';

import { StickerUserLibraryWasCreatedEvent } from './events/StickerUserLibraryWasCreatedEvent';
import { StickerReference } from './StickerReference';
import { StickerId } from './value-objects/StickerId';
import { StickerPackId } from './value-objects/StickerPackId';

export class StickerUserLibrary extends AggregateRoot {
  private static readonly MAX_RECENT_STICKERS = 10;

  public static create(identityId: IdentityId): StickerUserLibrary {
    const library = new StickerUserLibrary(identityId, [], [], []);
    const primitives = library.toPrimitives();

    library.record(
      new StickerUserLibraryWasCreatedEvent(identityId.valueOf(), {
        identityId: primitives.identityId,
        library: primitives,
      }),
    );

    return library;
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<StickerUserLibrary>,
  ): StickerUserLibrary {
    return new StickerUserLibrary(
      new IdentityId(primitives.identityId),
      primitives.savedPackIds.map((packId) => new StickerPackId(packId)),
      primitives.favoriteStickers.map((sticker) =>
        StickerReference.fromPrimitives({
          packId: sticker.packId,
          stickerId: sticker.stickerId,
          timestamp: sticker.favoritedAt,
        }),
      ),
      primitives.recentStickers.map((sticker) =>
        StickerReference.fromPrimitives({
          packId: sticker.packId,
          stickerId: sticker.stickerId,
          timestamp: sticker.usedAt,
        }),
      ),
    );
  }

  constructor(
    private readonly identityId: IdentityId,
    private readonly savedPackIds: StickerPackId[],
    private readonly favoriteStickers: StickerReference[],
    private readonly recentStickers: StickerReference[],
  ) {
    super();
  }

  private findFavorite(
    packId: StickerPackId,
    stickerId: StickerId,
  ): StickerReference | undefined {
    return this.favoriteStickers.find((sticker) =>
      sticker.isSameSticker(packId, stickerId),
    );
  }

  private findRecent(
    packId: StickerPackId,
    stickerId: StickerId,
  ): StickerReference | undefined {
    return this.recentStickers.find((sticker) =>
      sticker.isSameSticker(packId, stickerId),
    );
  }

  public favoriteSticker(packId: StickerPackId, stickerId: StickerId): void {
    if (this.findFavorite(packId, stickerId)) {
      return;
    }

    this.favoriteStickers.push(StickerReference.create(packId, stickerId));
  }

  public forgetPack(packId: StickerPackId): void {
    const index = this.savedPackIds.findIndex((savedPackId) =>
      savedPackId.isEqual(packId),
    );

    if (index >= 0) {
      this.savedPackIds.splice(index, 1);
    }
  }

  public recordStickerUse(packId: StickerPackId, stickerId: StickerId): void {
    const recent = this.findRecent(packId, stickerId);

    if (recent) {
      recent.touch();
    } else {
      this.recentStickers.push(StickerReference.create(packId, stickerId));
    }

    this.recentStickers.sort((first, second) =>
      second.isUsedAfter(first) ? 1 : -1,
    );
    this.recentStickers.splice(StickerUserLibrary.MAX_RECENT_STICKERS);
  }

  public savePack(packId: StickerPackId): void {
    if (this.savedPackIds.some((savedPackId) => savedPackId.isEqual(packId))) {
      return;
    }

    this.savedPackIds.push(packId);
  }

  public unfavoriteSticker(packId: StickerPackId, stickerId: StickerId): void {
    const index = this.favoriteStickers.findIndex((sticker) =>
      sticker.isSameSticker(packId, stickerId),
    );

    if (index >= 0) {
      this.favoriteStickers.splice(index, 1);
    }
  }

  public toPrimitives() {
    return {
      favoriteStickers: this.favoriteStickers.map((sticker) =>
        sticker.toFavoritePrimitives(),
      ),
      identityId: this.identityId.valueOf(),
      recentStickers: this.recentStickers.map((sticker) =>
        sticker.toRecentPrimitives(),
      ),
      savedPackIds: this.savedPackIds.map((packId) => packId.valueOf()),
    };
  }
}
