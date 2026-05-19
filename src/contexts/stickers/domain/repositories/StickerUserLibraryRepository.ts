import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { StickerUserLibrary } from '../StickerUserLibrary';

export interface StickerUserLibraryRepository {
  findByIdentityId(
    identityId: IdentityId,
  ): Promise<StickerUserLibrary | undefined>;
  save(library: StickerUserLibrary): Promise<void>;
}
