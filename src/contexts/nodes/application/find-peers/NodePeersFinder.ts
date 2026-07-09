import NodePeerRepository from '../../domain/repositories/NodePeerRepository';
import NodeRepository from '../../domain/repositories/NodeRepository';
import { ActiveNodePeers } from './ActiveNodePeers';

export default class NodePeersFinder {
  private static readonly ACTIVE_WINDOW_MS = 15 * 60 * 1000;

  constructor(
    private readonly repository: NodePeerRepository,
    private readonly nodeRepository: NodeRepository,
  ) {}

  public async find(): Promise<ActiveNodePeers> {
    const [localNode, peers] = await Promise.all([
      this.nodeRepository.loadLocalNode(),
      this.repository.findActive(
        new Date(Date.now() - NodePeersFinder.ACTIVE_WINDOW_MS),
      ),
    ]);

    return new ActiveNodePeers(localNode, peers);
  }
}
