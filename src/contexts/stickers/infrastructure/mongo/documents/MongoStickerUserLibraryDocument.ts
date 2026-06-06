import { MongoFavoriteStickerDocument } from './MongoFavoriteStickerDocument';
import { MongoRecentStickerDocument } from './MongoRecentStickerDocument';

export { MongoFavoriteStickerDocument } from './MongoFavoriteStickerDocument';
export { MongoRecentStickerDocument } from './MongoRecentStickerDocument';

export interface MongoStickerUserLibraryDocument {
  _id: string;
  favoriteStickers: MongoFavoriteStickerDocument[];
  recentStickers: MongoRecentStickerDocument[];
  savedPackIds: string[];
}
