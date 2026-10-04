import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { StickerPack } from '../StickerPack';
import { StickerPackId } from '../value-objects/StickerPackId';

export default abstract class StickerPackRepository {
  public abstract findAll(): Promise<StickerPack[]>;
  public abstract findById(id: StickerPackId): Promise<StickerPack | undefined>;
  public abstract findByOwner(
    ownerIdentityId: IdentityId,
  ): Promise<StickerPack[]>;

  public abstract save(
    pack: StickerPack,
    proof: PublicMutationProof,
  ): Promise<void>;
}
