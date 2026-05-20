import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { StickerPackName } from '../../../domain/value-objects/StickerPackName';

export class StickerPackCreateMessage {
  public readonly name: StickerPackName;
  public readonly ownerIdentityId: IdentityId;

  constructor(ownerIdentityId: string, name: string) {
    this.ownerIdentityId = new IdentityId(ownerIdentityId);
    this.name = new StickerPackName(name);
  }
}
