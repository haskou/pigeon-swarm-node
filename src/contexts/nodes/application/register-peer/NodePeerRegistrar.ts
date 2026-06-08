import { NodePeer } from '../../domain/NodePeer';
import { NodePeerRepository } from '../../domain/repositories/NodePeerRepository';
import { NodeRepository } from '../../domain/repositories/NodeRepository';
import { NodePeerRegisterMessage } from './messages/NodePeerRegisterMessage';

export default class NodePeerRegistrar {
  constructor(
    private readonly nodeRepository: NodeRepository,
    private readonly peerRepository: NodePeerRepository,
  ) {}

  public async register(message: NodePeerRegisterMessage): Promise<void> {
    const localNode = await this.nodeRepository.loadLocalNode();

    if (localNode.isIdentifiedBy(message.nodeId)) {
      return;
    }

    await this.peerRepository.save(
      new NodePeer(
        message.nodeId,
        message.owner,
        message.networks,
        message.lastSeenAt,
        message.capabilities,
      ),
    );
  }
}
