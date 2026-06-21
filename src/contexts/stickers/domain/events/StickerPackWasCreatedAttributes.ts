import { PrimitiveOf } from '@haskou/value-objects';

import { StickerPack } from '../StickerPack';

export class StickerPackWasCreatedAttributes {
  [key: string]: unknown;

  public readonly ownerIdentityId?: string;
  public readonly pack?: PrimitiveOf<StickerPack>;
  public readonly packId?: string;
}
