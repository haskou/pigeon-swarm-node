import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

export class IPFSContentReplicationNetworkSyncResponseMessage {
  public readonly networkId: NetworkId;

  constructor(
    networkId: string,
    public readonly requestId?: string,
  ) {
    this.networkId = new NetworkId(networkId);
  }
}
