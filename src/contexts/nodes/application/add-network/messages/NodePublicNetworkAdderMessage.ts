import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { Network } from '../../../domain/Network';
import { NetworkName } from '../../../domain/value-objects/NetworkName';

export class NodePublicNetworkAdderMessage {
  public readonly network: Network;
  /** Undefined while nobody claimed the node. */
  public readonly authenticatedIdentityId?: IdentityId;

  constructor(authenticatedIdentityId: string | undefined) {
    this.network = new Network(NetworkId.generate(), new NetworkName('public'));
    this.authenticatedIdentityId =
      authenticatedIdentityId === undefined
        ? undefined
        : new IdentityId(authenticatedIdentityId);
  }
}
