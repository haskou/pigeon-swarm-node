export interface OrbitDBStickerSavedPackDocument extends Record<
  string,
  unknown
> {
  id: string;
  identityId: string;
  packId: string;
  savedAt: number;
  scopeType: 'sticker_saved_pack';
}
