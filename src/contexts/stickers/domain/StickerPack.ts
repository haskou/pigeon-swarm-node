import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import AggregateRoot from '@app/shared/domain/AggregateRoot';
import { assert, PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { InvalidStickerEmojiError } from './errors/InvalidStickerEmojiError';
import { StickerNotFoundError } from './errors/StickerNotFoundError';
import { StickerPackOwnerMismatchError } from './errors/StickerPackOwnerMismatchError';
import { Sticker } from './Sticker';
import { StickerDetails } from './StickerDetails';
import { StickerId } from './value-objects/StickerId';
import { StickerPackDescription } from './value-objects/StickerPackDescription';
import { StickerPackId } from './value-objects/StickerPackId';
import { StickerPackName } from './value-objects/StickerPackName';

export class StickerPack extends AggregateRoot {
  public static create(
    ownerIdentityId: IdentityId,
    name: StickerPackName,
    description: StickerPackDescription,
  ): StickerPack {
    return new StickerPack(
      StickerPackId.generate(),
      ownerIdentityId,
      name,
      description,
      [],
      Timestamp.now(),
      Timestamp.now(),
    );
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<StickerPack>,
  ): StickerPack {
    return new StickerPack(
      new StickerPackId(primitives.id),
      new IdentityId(primitives.ownerIdentityId),
      new StickerPackName(primitives.name),
      new StickerPackDescription(primitives.description),
      primitives.stickers.map((sticker) => Sticker.fromPrimitives(sticker)),
      new Timestamp(primitives.createdAt),
      new Timestamp(primitives.updatedAt),
    );
  }

  constructor(
    private readonly id: StickerPackId,
    private readonly ownerIdentityId: IdentityId,
    private name: StickerPackName,
    private description: StickerPackDescription,
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

  private assertHasEmoji(details: StickerDetails): void {
    assert(details.getEmojis().length > 0, new InvalidStickerEmojiError());
  }

  private findSticker(stickerId: StickerId): Sticker | undefined {
    return this.stickers.find((sticker) => sticker.getId().isEqual(stickerId));
  }

  private touch(): void {
    this.updatedAt = Timestamp.now();
  }

  public addSticker(actor: IdentityId, details: StickerDetails): Sticker {
    this.assertOwner(actor);
    this.assertHasEmoji(details);

    const sticker = Sticker.create(details);

    this.stickers.push(sticker);
    this.touch();

    return sticker;
  }

  public assertHasSticker(stickerId: StickerId): void {
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

  public updateProfile(
    actor: IdentityId,
    name: StickerPackName,
    description: StickerPackDescription,
  ): void {
    this.assertOwner(actor);
    this.name = name;
    this.description = description;
    this.touch();
  }

  public updateSticker(
    actor: IdentityId,
    stickerId: StickerId,
    details: StickerDetails,
  ): Sticker {
    this.assertOwner(actor);
    this.assertHasEmoji(details);

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
      description: this.description.valueOf(),
      id: this.id.valueOf(),
      name: this.name.valueOf(),
      ownerIdentityId: this.ownerIdentityId.valueOf(),
      stickers: this.stickers.map((sticker) => sticker.toPrimitives()),
      updatedAt: this.updatedAt.valueOf(),
    };
  }
}
