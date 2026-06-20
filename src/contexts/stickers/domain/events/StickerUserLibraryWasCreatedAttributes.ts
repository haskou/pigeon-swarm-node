import { PrimitiveOf } from '@haskou/value-objects';

import { StickerUserLibrary } from '../StickerUserLibrary';

export class StickerUserLibraryWasCreatedAttributes {
  [key: string]: unknown;

  public readonly identityId?: string;
  public readonly library?: PrimitiveOf<StickerUserLibrary>;
}
