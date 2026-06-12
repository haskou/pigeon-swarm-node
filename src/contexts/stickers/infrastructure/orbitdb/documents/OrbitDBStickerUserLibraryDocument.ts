import { OrbitDBFavoriteStickerDocument } from './OrbitDBFavoriteStickerDocument';
import { OrbitDBRecentStickerDocument } from './OrbitDBRecentStickerDocument';

export interface OrbitDBStickerUserLibraryDocument extends Record<
  string,
  unknown
> {
  favoriteStickers: OrbitDBFavoriteStickerDocument[];
  id: string;
  identityId: string;
  recentStickers: OrbitDBRecentStickerDocument[];
  savedPackIds: string[];
}
