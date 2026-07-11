import { StickerPack } from '@app/contexts/stickers/domain/StickerPack';

export class StickerPackMother {
  public static readonly ownerIdentityId =
    'MCowBQYDK2VwAyEAIZERRRhGaokvb3xQqMGr9Y2ble6jUd51OuZRsvW52Q4=';

  public static readonly packId = 'sticker-pack-1';

  public static readonly stickerId = 'sticker-1';

  public static create(options: { withSticker?: boolean } = {}): StickerPack {
    return StickerPack.fromPrimitives({
      createdAt: 1780000000000,
      id: StickerPackMother.packId,
      name: 'Pigeon moods',
      ownerIdentityId: StickerPackMother.ownerIdentityId,
      stickers: options.withSticker
        ? [
            {
              assetCid: 'bagaaierastickerassetcid',
              contentType: 'image/png',
              dimensions: { height: 128, width: 128 },
              id: StickerPackMother.stickerId,
              sizeBytes: 32 * 1024,
              type: 'static',
            },
          ]
        : [],
      updatedAt: 1780000000000,
    });
  }
}
