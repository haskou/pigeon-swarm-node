import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { StickerPackId } from '../../../domain/value-objects/StickerPackId';
import { StickerPackName } from '../../../domain/value-objects/StickerPackName';

export class StickerPackUpdateMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly name: StickerPackName;
  public readonly packId: StickerPackId;
  public readonly proof: PublicMutationProof;
  public readonly updatedAt: Timestamp;

  constructor(
    packId: string,
    actorIdentityId: string,
    name: string,
    updatedAt: number,
    mutation: unknown,
  ) {
    this.packId = new StickerPackId(packId);
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.name = new StickerPackName(name);
    this.updatedAt = new Timestamp(updatedAt);
    this.proof = PublicMutationProof.fromPrimitives(mutation);
  }
}
