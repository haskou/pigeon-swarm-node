import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { StickerId } from './value-objects/StickerId';
import { StickerPackId } from './value-objects/StickerPackId';

export class StickerReference {
  public static create(
    packId: StickerPackId,
    stickerId: StickerId,
    timestamp: Timestamp = Timestamp.now(),
  ): StickerReference {
    return new StickerReference(packId, stickerId, timestamp);
  }

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
    private timestamp: Timestamp,
  ) {}

  public getPackId(): StickerPackId {
    return this.packId;
  }

  public getStickerId(): StickerId {
    return this.stickerId;
  }

  public isSameSticker(packId: StickerPackId, stickerId: StickerId): boolean {
    return this.packId.isEqual(packId) && this.stickerId.isEqual(stickerId);
  }

  public isUsedAfter(other: StickerReference): boolean {
    return this.timestamp.isAfter(other.timestamp);
  }

  public touch(timestamp: Timestamp = Timestamp.now()): void {
    this.timestamp = timestamp;
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
