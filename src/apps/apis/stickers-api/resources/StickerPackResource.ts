import { StickerResource } from './StickerResource';

export interface StickerPackResource {
  createdAt: number;
  description: string;
  id: string;
  name: string;
  ownerIdentityId: string;
  stickers: StickerResource[];
  updatedAt: number;
}
