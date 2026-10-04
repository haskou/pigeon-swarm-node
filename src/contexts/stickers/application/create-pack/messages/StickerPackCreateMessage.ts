import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { StickerPackId } from '../../../domain/value-objects/StickerPackId';
import { StickerPackName } from '../../../domain/value-objects/StickerPackName';

export class StickerPackCreateMessage {
  public readonly createdAt: Timestamp;
  public readonly name: StickerPackName;
  public readonly ownerIdentityId: IdentityId;
  public readonly packId: StickerPackId;
  public readonly proof: PublicMutationProof;
  public readonly savedPackProof: PublicMutationProof;

  constructor(
    ownerIdentityId: string,
    packId: string,
    name: string,
    createdAt: number,
    mutation: unknown,
    savedPackMutation: unknown,
  ) {
    this.ownerIdentityId = new IdentityId(ownerIdentityId);
    this.packId = new StickerPackId(packId);
    this.name = new StickerPackName(name);
    this.createdAt = new Timestamp(createdAt);
    this.proof = PublicMutationProof.fromPrimitives(mutation);
    this.savedPackProof = PublicMutationProof.fromPrimitives(savedPackMutation);
  }
}
