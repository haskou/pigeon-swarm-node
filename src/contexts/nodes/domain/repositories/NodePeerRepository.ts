import { NodePeer } from '../NodePeer';

export interface NodePeerRepository {
  findActive(since: Date): Promise<NodePeer[]>;
  save(peer: NodePeer): Promise<void>;
}
