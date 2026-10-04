import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { StickerId } from './value-objects/StickerId';
import { StickerPackId } from './value-objects/StickerPackId';

export class StickerReference {
  public static fromPrimitives(
    primitives: PrimitiveOf<StickerReference>,
  ): StickerReference {
    return new StickerReference(
      new StickerPackId(String(primitives.packId)),
      new StickerId(String(primitives.stickerId)),
      new Timestamp(Number(primitives.timestamp)),
    );
  }

  constructor(
    private readonly packId: StickerPackId,
    private readonly stickerId: StickerId,
    private readonly timestamp: Timestamp,
  ) {}

  public getPackId(): StickerPackId {
    return this.packId;
  }

  public getStickerId(): StickerId {
    return this.stickerId;
  }

  public isUsedAfter(other: StickerReference): boolean {
    return this.timestamp.isAfter(other.timestamp);
  }

  public toPrimitives(): {
    packId: string;
    stickerId: string;
    timestamp: number;
  } {
    return {
      packId: this.packId.valueOf(),
      stickerId: this.stickerId.valueOf(),
      timestamp: this.timestamp.valueOf(),
    };
  }

  public toFavoritePrimitives(): {
    favoritedAt: number;
    packId: string;
    stickerId: string;
  } {
    const primitives = this.toPrimitives();

    return {
      favoritedAt: primitives.timestamp,
      packId: primitives.packId,
      stickerId: primitives.stickerId,
    };
  }

  public toRecentPrimitives(): {
    packId: string;
    stickerId: string;
    usedAt: number;
  } {
    const primitives = this.toPrimitives();

    return {
      packId: primitives.packId,
      stickerId: primitives.stickerId,
      usedAt: primitives.timestamp,
    };
  }
}
