export interface OrbitDBStickerFavoriteDocument extends Record<
  string,
  unknown
> {
  favoritedAt: number;
  id: string;
  identityId: string;
  packId: string;
  scopeType: 'sticker_favorite';
  stickerId: string;
}
