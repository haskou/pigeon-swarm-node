import { StickerPackResource } from './StickerPackResource';
import {
  FavoriteStickerResource,
  RecentStickerResource,
} from './StickerReferenceResource';

export interface StickerUserLibraryResource {
  favoriteStickers: FavoriteStickerResource[];
  recentStickers: RecentStickerResource[];
  savedPacks: StickerPackResource[];
}
