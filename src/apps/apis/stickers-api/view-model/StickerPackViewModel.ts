import { StickerPack } from '@app/contexts/stickers/domain/StickerPack';

import { StickerPackResource } from '../resources/StickerPackResource';

export class StickerPackViewModel {
  constructor(private readonly pack: StickerPack) {}

  public toResource(): StickerPackResource {
    return this.pack.toPrimitives();
  }
}
