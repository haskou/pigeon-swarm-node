import { StickerResource } from './StickerResource';

export interface FavoriteStickerResource {
  favoritedAt: number;
  packId: string;
  sticker: StickerResource;
  stickerId: string;
}

export interface RecentStickerResource {
  packId: string;
  sticker: StickerResource;
  stickerId: string;
  usedAt: number;
}
