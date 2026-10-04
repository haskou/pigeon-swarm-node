import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { StickerPackId } from '../../../domain/value-objects/StickerPackId';

export class StickerPackSaveMessage {
  public readonly identityId: IdentityId;
  public readonly packId: StickerPackId;
  public readonly proof: PublicMutationProof;
  public readonly savedAt: Timestamp;

  constructor(
    identityId: string,
    packId: string,
    savedAt: number,
    mutation: unknown,
  ) {
    this.identityId = new IdentityId(identityId);
    this.packId = new StickerPackId(packId);
    this.savedAt = new Timestamp(savedAt);
    this.proof = PublicMutationProof.fromPrimitives(mutation);
  }
}
