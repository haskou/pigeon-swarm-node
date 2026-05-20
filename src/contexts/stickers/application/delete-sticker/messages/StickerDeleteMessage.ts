import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { StickerId } from '../../../domain/value-objects/StickerId';
import { StickerPackId } from '../../../domain/value-objects/StickerPackId';

export class StickerDeleteMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly packId: StickerPackId;
  public readonly stickerId: StickerId;

  constructor(packId: string, stickerId: string, actorIdentityId: string) {
    this.packId = new StickerPackId(packId);
    this.stickerId = new StickerId(stickerId);
    this.actorIdentityId = new IdentityId(actorIdentityId);
  }
}
