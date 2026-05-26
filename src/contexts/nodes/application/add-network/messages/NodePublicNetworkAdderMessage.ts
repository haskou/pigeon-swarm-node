import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { Network } from '../../../domain/Network';
import { NetworkName } from '../../../domain/value-objects/NetworkName';

export class NodePublicNetworkAdderMessage {
  public readonly network: Network;

  constructor() {
    this.network = new Network(NetworkId.generate(), new NetworkName('public'));
  }
}
