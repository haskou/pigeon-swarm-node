import IdentityNetworkRepository from '@app/contexts/identities/domain/repositories/IdentityNetworkRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import IdentityMetadataIndex from './IdentityMetadataIndex';

export default class MetadataIdentityNetworkRepository extends IdentityNetworkRepository {
  constructor(private readonly metadataIndex: IdentityMetadataIndex) {
    super();
  }

  public async findByIdentityId(identityId: IdentityId): Promise<NetworkId[]> {
    const records = await this.metadataIndex.findByIdentityId(identityId);
    const latest = records.find(({ identity }) => identity !== undefined);

    return latest?.identity?.getNetworkIds() ?? [];
  }
}
