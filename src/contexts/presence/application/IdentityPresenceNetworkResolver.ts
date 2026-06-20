import IdentityMetadataIndex from '@app/contexts/identities/infrastructure/metadata/IdentityMetadataIndex';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export default class IdentityPresenceNetworkResolver {
  constructor(private readonly metadataIndex: IdentityMetadataIndex) {}

  public async resolve(identityId: IdentityId): Promise<string[]> {
    const documents = await this.metadataIndex.findByIdentityId(identityId);
    const [latest] = documents;

    return latest?.networkIds || [];
  }
}
