import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

export class ConversationNetworkSyncResponseMessage {
  public readonly networkId: NetworkId;

  constructor(
    networkId: string,
    public readonly requestId?: string,
  ) {
    this.networkId = new NetworkId(networkId);
  }
}
