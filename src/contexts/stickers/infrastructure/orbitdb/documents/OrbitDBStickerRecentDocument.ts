export interface OrbitDBStickerRecentDocument extends Record<string, unknown> {
  id: string;
  identityId: string;
  packId: string;
  scopeType: 'sticker_recent';
  stickerId: string;
  usedAt: number;
}
