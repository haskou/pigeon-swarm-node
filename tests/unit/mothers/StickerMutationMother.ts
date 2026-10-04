import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { signedMutation } from '../contexts/public-mutations/support/signedMutation';
import { StickerPackMother } from './StickerPackMother';

export class StickerMutationMother {
  /** A structurally valid proof; application specs never verify it. */
  public static async create(
    store = 'stickerPacks',
    kind: 'put' | 'delete' = 'put',
  ): Promise<ReturnType<PublicMutationProof['toPrimitives']>> {
    return (
      await signedMutation({
        identityId: StickerPackMother.ownerIdentityId,
        kind,
        recordId: 'unused',
        sequence: 1,
        store,
      })
    ).toPrimitives();
  }
}
