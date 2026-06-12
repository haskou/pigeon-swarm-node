import { NodePeer } from '../NodePeer';

export default abstract class NodePeerRepository {
  public abstract findActive(since: Date): Promise<NodePeer[]>;
  public abstract save(peer: NodePeer): Promise<void>;
}
