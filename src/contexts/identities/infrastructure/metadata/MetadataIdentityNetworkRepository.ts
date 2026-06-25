import IdentityNetworkRepository from '@app/contexts/identities/domain/repositories/IdentityNetworkRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import IdentityMetadataIndex from './IdentityMetadataIndex';
import { IdentityMetadataRecord } from './IdentityMetadataRecord';

export default class MetadataIdentityNetworkRepository extends IdentityNetworkRepository {
  constructor(private readonly metadataIndex: IdentityMetadataIndex) {
    super();
  }

  private networkIdsFrom(record: IdentityMetadataRecord): NetworkId[] {
    const networkIds = record.networkIds || [];

    return networkIds.map((networkId) => new NetworkId(networkId));
  }

  public async findByIdentityId(identityId: IdentityId): Promise<NetworkId[]> {
    const records = await this.metadataIndex.findByIdentityId(identityId);
    const [latest] = records;

    return latest ? this.networkIdsFrom(latest) : [];
  }
}
