import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { StickerPackId } from '../../../domain/value-objects/StickerPackId';
import { StickerPackName } from '../../../domain/value-objects/StickerPackName';

export class StickerPackUpdateMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly name: StickerPackName;
  public readonly packId: StickerPackId;

  constructor(packId: string, actorIdentityId: string, name: string) {
    this.packId = new StickerPackId(packId);
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.name = new StickerPackName(name);
  }
}
