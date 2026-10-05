import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { StickerId } from '../../../domain/value-objects/StickerId';
import { StickerPackId } from '../../../domain/value-objects/StickerPackId';

export class StickerDeleteMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly packId: StickerPackId;
  public readonly proof: PublicMutationProof;
  public readonly stickerId: StickerId;
  public readonly updatedAt: Timestamp;

  constructor(
    packId: string,
    stickerId: string,
    actorIdentityId: string,
    updatedAt: number,
    mutation: unknown,
  ) {
    this.packId = new StickerPackId(packId);
    this.stickerId = new StickerId(stickerId);
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.updatedAt = new Timestamp(updatedAt);
    this.proof = PublicMutationProof.fromPrimitives(mutation);
  }
}
