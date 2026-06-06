import { StickerResource } from './StickerResource';

export interface FavoriteStickerResource {
  favoritedAt: number;
  packId: string;
  sticker: StickerResource;
  stickerId: string;
}
