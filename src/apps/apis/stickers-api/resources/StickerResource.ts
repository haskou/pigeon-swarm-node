export interface StickerResource {
  assetCid: string;
  contentType: string;
  dimensions: {
    height: number;
    width: number;
  };
  id: string;
  name: string;
  sizeBytes: number;
  type: string;
}
