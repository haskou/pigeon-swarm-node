import { OrbitDBStickerFavoriteDocument } from './OrbitDBStickerFavoriteDocument';
import { OrbitDBStickerRecentDocument } from './OrbitDBStickerRecentDocument';
import { OrbitDBStickerSavedPackDocument } from './OrbitDBStickerSavedPackDocument';

/** One independently signed record of a user's sticker library. */
export type OrbitDBStickerLibraryDocument =
  | OrbitDBStickerFavoriteDocument
  | OrbitDBStickerRecentDocument
  | OrbitDBStickerSavedPackDocument;
