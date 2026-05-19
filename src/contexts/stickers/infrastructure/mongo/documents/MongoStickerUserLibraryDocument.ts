export interface MongoFavoriteStickerDocument {
  favoritedAt: number;
  packId: string;
  stickerId: string;
}

export interface MongoRecentStickerDocument {
  packId: string;
  stickerId: string;
  usedAt: number;
}

export interface MongoStickerUserLibraryDocument {
  _id: string;
  favoriteStickers: MongoFavoriteStickerDocument[];
  recentStickers: MongoRecentStickerDocument[];
  savedPackIds: string[];
}
