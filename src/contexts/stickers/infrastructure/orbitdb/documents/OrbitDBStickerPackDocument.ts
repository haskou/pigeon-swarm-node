import { OrbitDBStickerDocument } from './OrbitDBStickerDocument';

export interface OrbitDBStickerPackDocument extends Record<string, unknown> {
  createdAt: number;
  id: string;
  name: string;
  ownerIdentityId: string;
  scopeType: 'sticker_pack';
  stickers: OrbitDBStickerDocument[];
  updatedAt: number;
}
