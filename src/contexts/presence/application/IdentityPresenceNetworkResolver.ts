import { MongoIdentityMetadataRepository } from '@app/contexts/identities/infrastructure/mongo';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export default class IdentityPresenceNetworkResolver {
  constructor(
    private readonly metadataRepository: MongoIdentityMetadataRepository,
  ) {}

  public async resolve(identityId: IdentityId): Promise<string[]> {
    const documents =
      await this.metadataRepository.findByIdentityId(identityId);
    const [latest] = documents;

    return latest?.networkIds || [];
  }
}
