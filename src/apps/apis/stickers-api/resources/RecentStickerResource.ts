import { StickerResource } from './StickerResource';

export interface RecentStickerResource {
  packId: string;
  sticker: StickerResource;
  stickerId: string;
  usedAt: number;
}
