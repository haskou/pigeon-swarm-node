import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { AggregateRoot } from '@haskou/ddd-kernel/domain';
import { PrimitiveOf } from '@haskou/value-objects';

import { StickerUserLibraryWasCreatedEvent } from './events/StickerUserLibraryWasCreatedEvent';
import { StickerReference } from './StickerReference';
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
      primitives.recentStickers
        .map((sticker) =>
          StickerReference.fromPrimitives({
            packId: sticker.packId,
            stickerId: sticker.stickerId,
            timestamp: sticker.usedAt,
          }),
        )
        .sort((first, second) => (second.isUsedAfter(first) ? 1 : -1))
        .slice(0, StickerUserLibrary.MAX_RECENT_STICKERS),
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
