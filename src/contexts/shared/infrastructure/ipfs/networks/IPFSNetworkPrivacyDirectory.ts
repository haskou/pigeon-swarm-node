import NetworkPrivacyDirectory from '@app/contexts/shared/domain/networks/NetworkPrivacyDirectory';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';

export default class IPFSNetworkPrivacyDirectory extends NetworkPrivacyDirectory {
  constructor(private readonly networkRegistry: IPFSNetworkRegistry) {
    super();
  }

  public isPrivate(networkId: NetworkId): boolean {
    return this.networkRegistry.find(networkId.valueOf()).isPrivate();
  }
}
