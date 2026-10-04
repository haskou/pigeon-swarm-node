import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { StickerUserLibrary } from '../StickerUserLibrary';
import { StickerId } from '../value-objects/StickerId';
import { StickerPackId } from '../value-objects/StickerPackId';

/** Every operation is an independently signed record of the identity's library. */
export default abstract class StickerUserLibraryRepository {
  public abstract favorite(
    identityId: IdentityId,
    packId: StickerPackId,
    stickerId: StickerId,
    favoritedAt: Timestamp,
    proof: PublicMutationProof,
  ): Promise<void>;

  public abstract findByIdentityId(
    identityId: IdentityId,
  ): Promise<StickerUserLibrary | undefined>;

  public abstract forgetPack(
    identityId: IdentityId,
    packId: StickerPackId,
    proof: PublicMutationProof,
  ): Promise<void>;

  public abstract recordUse(
    identityId: IdentityId,
    packId: StickerPackId,
    stickerId: StickerId,
    usedAt: Timestamp,
    proof: PublicMutationProof,
  ): Promise<void>;

  public abstract savePack(
    identityId: IdentityId,
    packId: StickerPackId,
    savedAt: Timestamp,
    proof: PublicMutationProof,
  ): Promise<void>;

  public abstract unfavorite(
    identityId: IdentityId,
    packId: StickerPackId,
    stickerId: StickerId,
    proof: PublicMutationProof,
  ): Promise<void>;
}
