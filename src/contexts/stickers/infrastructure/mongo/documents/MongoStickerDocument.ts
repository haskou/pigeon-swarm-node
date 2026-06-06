import { StickerTypeValue } from '../../../domain/value-objects/StickerType';

export interface MongoStickerDocument {
  assetCid: string;
  contentType: string;
  dimensions: {
    height: number;
    width: number;
  };
  id: string;
  sizeBytes: number;
  type: StickerTypeValue;
}
