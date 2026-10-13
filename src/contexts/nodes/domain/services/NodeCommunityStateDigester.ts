import { NodeCommunityStateDigest } from '../value-objects/NodeCommunityStateDigest';

export default abstract class NodeCommunityStateDigester {
  public abstract digest(networkId: string): Promise<NodeCommunityStateDigest>;
}
