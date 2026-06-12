import { StickerTypeValue } from '../../../domain/value-objects/StickerType';

export interface OrbitDBStickerDocument {
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
