import { Node } from '../../domain/Node';
import { NodePeer } from '../../domain/NodePeer';

export class ActiveNodePeers {
  constructor(
    private readonly localNode: Node,
    private readonly peers: NodePeer[],
  ) {}

  public getLocalNode(): Node {
    return this.localNode;
  }

  public getPeers(): NodePeer[] {
    return [...this.peers];
  }
}
