import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { StickerPackId } from '../../../domain/value-objects/StickerPackId';

export class StickerPackForgetMessage {
  public readonly identityId: IdentityId;
  public readonly packId: StickerPackId;

  constructor(identityId: string, packId: string) {
    this.identityId = new IdentityId(identityId);
    this.packId = new StickerPackId(packId);
  }
}
