import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

export class NodeNetworkRemoverMessage {
  public readonly networkId: NetworkId;

  constructor(networkId: string) {
    this.networkId = new NetworkId(networkId);
  }
}
