import { StickerPackResource } from './StickerPackResource';
import {
  FavoriteStickerResource,
  RecentStickerResource,
} from './StickerReferenceResource';

export interface StickerUserLibraryResource {
  favoriteStickers: FavoriteStickerResource[];
  favoriteStickersNextCursor: string | null;
  recentStickers: RecentStickerResource[];
  savedPacks: StickerPackResource[];
  savedPacksNextCursor: string | null;
}
