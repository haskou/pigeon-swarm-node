import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import StickerFavoriteMutationPolicy from '@app/contexts/stickers/infrastructure/orbitdb/policies/StickerFavoriteMutationPolicy';
import StickerPackMutationPolicy from '@app/contexts/stickers/infrastructure/orbitdb/policies/StickerPackMutationPolicy';
import StickerRecentMutationPolicy from '@app/contexts/stickers/infrastructure/orbitdb/policies/StickerRecentMutationPolicy';
import StickerSavedPackMutationPolicy from '@app/contexts/stickers/infrastructure/orbitdb/policies/StickerSavedPackMutationPolicy';

export default class StickerMutationPolicies {
  constructor(
    private readonly packs: StickerPackMutationPolicy,
    private readonly favorites: StickerFavoriteMutationPolicy,
    private readonly savedPacks: StickerSavedPackMutationPolicy,
    private readonly recents: StickerRecentMutationPolicy,
  ) {}

  public all(): PublicMutationPolicy[] {
    return [this.packs, this.favorites, this.savedPacks, this.recents];
  }
}
