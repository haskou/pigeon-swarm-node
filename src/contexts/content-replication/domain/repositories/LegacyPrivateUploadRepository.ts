import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { ContentId } from '../value-objects/ContentId';

export type LegacyPrivateUpload = {
  cid: ContentId;
  networkId: NetworkId;
};

/**
 * Legacy private uploads whose owner proof verifies. They are never admitted
 * to replication, so the maintainer stops providing them.
 */
export default abstract class LegacyPrivateUploadRepository {
  public abstract findGenuine(): Promise<LegacyPrivateUpload[]>;
}
