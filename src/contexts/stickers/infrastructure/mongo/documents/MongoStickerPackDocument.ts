import { MongoStickerDocument } from './MongoStickerDocument';

export interface MongoStickerPackDocument {
  _id: string;
  createdAt: number;
  name: string;
  ownerIdentityId: string;
  stickers: MongoStickerDocument[];
  updatedAt: number;
}
