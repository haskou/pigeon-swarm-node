import IdentityNetworksFinder from '@app/contexts/identities/application/find-networks/IdentityNetworksFinder';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export default class IdentityPresenceNetworkResolver {
  constructor(
    private readonly identityNetworksFinder: IdentityNetworksFinder,
  ) {}

  public async resolve(identityId: IdentityId): Promise<string[]> {
    const networkIds = await this.identityNetworksFinder.find(identityId);

    return networkIds.map((networkId) => networkId.valueOf());
  }
}
