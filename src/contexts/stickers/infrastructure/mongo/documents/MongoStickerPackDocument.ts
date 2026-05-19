import { StickerTypeValue } from '../../../domain/value-objects/StickerType';

export interface MongoStickerDocument {
  assetCid: string;
  contentType: string;
  dimensions: {
    height: number;
    width: number;
  };
  emojis: string[];
  id: string;
  name: string;
  sizeBytes: number;
  type: StickerTypeValue;
}

export interface MongoStickerPackDocument {
  _id: string;
  createdAt: number;
  description: string;
  name: string;
  ownerIdentityId: string;
  stickers: MongoStickerDocument[];
  updatedAt: number;
}
