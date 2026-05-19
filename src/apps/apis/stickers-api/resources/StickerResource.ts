export interface StickerResource {
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
  type: string;
}
