import IdentityNetworkRepository from '@app/contexts/identities/domain/repositories/IdentityNetworkRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

export default class IdentityNetworksFinder {
  constructor(private readonly repository: IdentityNetworkRepository) {}

  public async find(identityId: IdentityId): Promise<NetworkId[]> {
    return this.repository.findByIdentityId(identityId);
  }
}
