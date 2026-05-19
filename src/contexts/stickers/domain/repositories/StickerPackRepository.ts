import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { StickerPack } from '../StickerPack';
import { StickerPackId } from '../value-objects/StickerPackId';

export interface StickerPackRepository {
  findAll(): Promise<StickerPack[]>;
  findById(id: StickerPackId): Promise<StickerPack | undefined>;
  findByOwner(ownerIdentityId: IdentityId): Promise<StickerPack[]>;
  save(pack: StickerPack): Promise<void>;
}
