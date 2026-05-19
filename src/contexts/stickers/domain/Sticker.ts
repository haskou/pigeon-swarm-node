import { PrimitiveOf } from '@haskou/value-objects';

import { StickerDetails } from './StickerDetails';
import { StickerId } from './value-objects/StickerId';

export class Sticker {
  public static create(details: StickerDetails): Sticker {
    return new Sticker(StickerId.generate(), details);
  }

  public static fromPrimitives(primitives: PrimitiveOf<Sticker>): Sticker {
    return new Sticker(
      new StickerId(primitives.id),
      StickerDetails.fromPrimitives(primitives),
    );
  }

  constructor(
    private readonly id: StickerId,
    private details: StickerDetails,
  ) {}

  public getId(): StickerId {
    return this.id;
  }

  public update(details: StickerDetails): void {
    this.details = details;
  }

  public toPrimitives() {
    return {
      id: this.id.valueOf(),
      ...this.details.toPrimitives(),
    };
  }
}
