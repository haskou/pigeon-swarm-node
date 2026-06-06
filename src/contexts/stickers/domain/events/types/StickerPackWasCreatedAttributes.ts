import { PrimitiveOf } from '@haskou/value-objects';

import { StickerPack } from '../../StickerPack';

export type StickerPackWasCreatedAttributes = {
  ownerIdentityId: string;
  pack: PrimitiveOf<StickerPack>;
  packId: string;
};
