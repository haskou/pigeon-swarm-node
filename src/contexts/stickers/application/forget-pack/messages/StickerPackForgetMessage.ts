import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { StickerPackId } from '../../../domain/value-objects/StickerPackId';

export class StickerPackForgetMessage {
  public readonly identityId: IdentityId;
  public readonly packId: StickerPackId;
  public readonly proof: PublicMutationProof;

  constructor(identityId: string, packId: string, mutation: unknown) {
    this.identityId = new IdentityId(identityId);
    this.packId = new StickerPackId(packId);
    this.proof = PublicMutationProof.fromPrimitives(mutation);
  }
}
