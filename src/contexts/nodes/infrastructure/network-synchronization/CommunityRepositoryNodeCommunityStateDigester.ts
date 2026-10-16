import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import NodeCommunityStateDigester from '@app/contexts/nodes/domain/services/NodeCommunityStateDigester';
import { NodeCommunityStateDigest } from '@app/contexts/nodes/domain/value-objects/NodeCommunityStateDigest';
import { StateDigest } from '@haskou/pigeon-swarm-crypto';

/**
 * Digests the frontier of every community of a network. Frontiers are content
 * hashes of the operation DAG, so equal digests mean equal community state.
 */
export default class CommunityRepositoryNodeCommunityStateDigester extends NodeCommunityStateDigester {
  constructor(private readonly communityRepository: CommunityRepository) {
    super();
  }

  public async digest(networkId: string): Promise<NodeCommunityStateDigest> {
    const frontiers =
      await this.communityRepository.findFrontiersByNetwork(networkId);

    return new NodeCommunityStateDigest(
      StateDigest.communityFrontiers(
        frontiers.map(({ communityId, frontier }) => ({
          communityId: communityId.valueOf(),
          frontier,
        })),
      ),
    );
  }
}
