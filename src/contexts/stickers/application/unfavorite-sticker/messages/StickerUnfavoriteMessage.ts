import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { StickerId } from '../../../domain/value-objects/StickerId';
import { StickerPackId } from '../../../domain/value-objects/StickerPackId';

export class StickerUnfavoriteMessage {
  public readonly identityId: IdentityId;
  public readonly packId: StickerPackId;
  public readonly stickerId: StickerId;

  constructor(identityId: string, packId: string, stickerId: string) {
    this.identityId = new IdentityId(identityId);
    this.packId = new StickerPackId(packId);
    this.stickerId = new StickerId(stickerId);
  }
}
