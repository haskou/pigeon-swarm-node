import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { StickerId } from '../../../domain/value-objects/StickerId';
import { StickerPackId } from '../../../domain/value-objects/StickerPackId';

export class StickerFavoriteMessage {
  public readonly favoritedAt: Timestamp;
  public readonly identityId: IdentityId;
  public readonly packId: StickerPackId;
  public readonly proof: PublicMutationProof;
  public readonly stickerId: StickerId;

  constructor(
    identityId: string,
    packId: string,
    stickerId: string,
    favoritedAt: number,
    mutation: unknown,
  ) {
    this.identityId = new IdentityId(identityId);
    this.packId = new StickerPackId(packId);
    this.favoritedAt = new Timestamp(favoritedAt);
    this.proof = PublicMutationProof.fromPrimitives(mutation);
    this.stickerId = new StickerId(stickerId);
  }
}
