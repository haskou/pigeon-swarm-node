import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { StickerUserLibrary } from '../StickerUserLibrary';

export default abstract class StickerUserLibraryRepository {
  public abstract findByIdentityId(
    identityId: IdentityId,
  ): Promise<StickerUserLibrary | undefined>;

  public abstract save(library: StickerUserLibrary): Promise<void>;
}
