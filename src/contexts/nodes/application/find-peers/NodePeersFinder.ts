import { NodePeer } from '../../domain/NodePeer';
import NodePeerRepository from '../../domain/repositories/NodePeerRepository';

export default class NodePeersFinder {
  private static readonly ACTIVE_WINDOW_MS = 15 * 60 * 1000;

  constructor(private readonly repository: NodePeerRepository) {}

  public async findActive(): Promise<NodePeer[]> {
    return this.repository.findActive(
      new Date(Date.now() - NodePeersFinder.ACTIVE_WINDOW_MS),
    );
  }
}
