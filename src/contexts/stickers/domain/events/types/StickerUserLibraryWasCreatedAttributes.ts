import { PrimitiveOf } from '@haskou/value-objects';

import { StickerUserLibrary } from '../../StickerUserLibrary';

export type StickerUserLibraryWasCreatedAttributes = {
  identityId: string;
  library: PrimitiveOf<StickerUserLibrary>;
};
