import { OrbitDBStickerDocument } from './OrbitDBStickerDocument';

export interface OrbitDBStickerPackDocument extends Record<string, unknown> {
  createdAt: number;
  id: string;
  name: string;
  ownerIdentityId: string;
  stickers: OrbitDBStickerDocument[];
  updatedAt: number;
}
