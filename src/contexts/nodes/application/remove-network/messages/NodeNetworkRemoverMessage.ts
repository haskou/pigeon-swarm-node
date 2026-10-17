import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

export class NodeNetworkRemoverMessage {
  public readonly networkId: NetworkId;
  public readonly authenticatedIdentityId: IdentityId;

  constructor(networkId: string, authenticatedIdentityId: string) {
    this.networkId = new NetworkId(networkId);
    this.authenticatedIdentityId = new IdentityId(authenticatedIdentityId);
  }
}
