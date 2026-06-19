import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import AggregateRoot from '@app/shared/domain/AggregateRoot';
import { assert, PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { StickerNotFoundError } from './errors/StickerNotFoundError';
import { StickerPackOwnerMismatchError } from './errors/StickerPackOwnerMismatchError';
import { StickerPackWasCreatedEvent } from './events/StickerPackWasCreatedEvent';
import { Sticker } from './Sticker';
import { StickerDetails } from './StickerDetails';
import { StickerId } from './value-objects/StickerId';
import { StickerPackId } from './value-objects/StickerPackId';
import { StickerPackName } from './value-objects/StickerPackName';

export class StickerPack extends AggregateRoot {
  public static create(
    ownerIdentityId: IdentityId,
    name: StickerPackName,
  ): StickerPack {
    const pack = new StickerPack(
      StickerPackId.generate(),
      ownerIdentityId,
      name,
      [],
      Timestamp.now(),
      Timestamp.now(),
    );

    const primitives = pack.toPrimitives();

    pack.record(
      new StickerPackWasCreatedEvent(pack.id.valueOf(), {
        ownerIdentityId: primitives.ownerIdentityId,
        pack: primitives,
        packId: primitives.id,
      }),
    );

    return pack;
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<StickerPack>,
  ): StickerPack {
    return new StickerPack(
      new StickerPackId(primitives.id),
      new IdentityId(primitives.ownerIdentityId),
      new StickerPackName(primitives.name),
      primitives.stickers.map((sticker) => Sticker.fromPrimitives(sticker)),
      new Timestamp(primitives.createdAt),
      new Timestamp(primitives.updatedAt),
    );
  }

  constructor(
    private readonly id: StickerPackId,
    private readonly ownerIdentityId: IdentityId,
    private name: StickerPackName,
    private readonly stickers: Sticker[],
    private readonly createdAt: Timestamp,
    private updatedAt: Timestamp,
  ) {
    super();
  }

  private assertOwner(identityId: IdentityId): void {
    assert(
      this.ownerIdentityId.isEqual(identityId),
      new StickerPackOwnerMismatchError(),
    );
  }

  private findSticker(stickerId: StickerId): Sticker | undefined {
    return this.stickers.find((sticker) => sticker.getId().isEqual(stickerId));
  }

  private touch(): void {
    this.updatedAt = Timestamp.now();
  }

  public addSticker(actor: IdentityId, details: StickerDetails): Sticker {
    this.assertOwner(actor);

    const sticker = Sticker.create(details);

    this.stickers.push(sticker);
    this.touch();

    return sticker;
  }

  public useSticker(stickerId: StickerId): void {
    assert(this.findSticker(stickerId), new StickerNotFoundError());
  }

  public removeSticker(actor: IdentityId, stickerId: StickerId): void {
    this.assertOwner(actor);

    const stickerIndex = this.stickers.findIndex((sticker) =>
      sticker.getId().isEqual(stickerId),
    );

    assert(stickerIndex >= 0, new StickerNotFoundError());
    this.stickers.splice(stickerIndex, 1);
    this.touch();
  }

  public updateProfile(actor: IdentityId, name: StickerPackName): void {
    this.assertOwner(actor);
    this.name = name;
    this.touch();
  }

  public updateSticker(
    actor: IdentityId,
    stickerId: StickerId,
    details: StickerDetails,
  ): Sticker {
    this.assertOwner(actor);

    const sticker = this.findSticker(stickerId);

    assert(sticker, new StickerNotFoundError());
    sticker.update(details);
    this.touch();

    return sticker;
  }

  public getId(): StickerPackId {
    return this.id;
  }

  public toPrimitives() {
    return {
      createdAt: this.createdAt.valueOf(),
      id: this.id.valueOf(),
      name: this.name.valueOf(),
      ownerIdentityId: this.ownerIdentityId.valueOf(),
      stickers: this.stickers.map((sticker) => sticker.toPrimitives()),
      updatedAt: this.updatedAt.valueOf(),
    };
  }
}
