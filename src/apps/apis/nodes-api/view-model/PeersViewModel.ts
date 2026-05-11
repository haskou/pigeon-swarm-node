import { NodePeer } from '@app/contexts/nodes/domain/NodePeer';

import { PeersResource } from '../resources/PeersResource';

export class PeersViewModel {
  constructor(private readonly peers: NodePeer[]) {}

  public toResource(): PeersResource {
    return {
      peers: this.peers.map((peer) => peer.toPrimitives()),
    };
  }
}
