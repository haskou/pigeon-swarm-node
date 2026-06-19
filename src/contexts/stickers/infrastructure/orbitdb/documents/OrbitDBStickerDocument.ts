export interface OrbitDBStickerDocument {
  assetCid: string;
  contentType: string;
  dimensions: {
    height: number;
    width: number;
  };
  id: string;
  sizeBytes: number;
  type: string;
}
