import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import NodeCommunityStateDigester from '@app/contexts/nodes/domain/services/NodeCommunityStateDigester';
import { NodeCommunityStateDigest } from '@app/contexts/nodes/domain/value-objects/NodeCommunityStateDigest';
import { createHash } from 'node:crypto';

/**
 * Hashes the frontier of every community of a network. Frontiers are content
 * hashes of the operation DAG, so equal digests mean equal community state.
 * Ordering uses code units, never the locale, so every node hashes alike.
 */
export default class CommunityRepositoryNodeCommunityStateDigester extends NodeCommunityStateDigester {
  constructor(private readonly communityRepository: CommunityRepository) {
    super();
  }

  public async digest(networkId: string): Promise<NodeCommunityStateDigest> {
    const frontiers = (
      await this.communityRepository.findFrontiersByNetwork(networkId)
    )
      .map(({ communityId, frontier }): [string, string[]] => [
        communityId.valueOf(),
        [...frontier].sort(),
      ])
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));

    return new NodeCommunityStateDigest(
      createHash('sha256')
        .update(JSON.stringify(frontiers))
        .digest('base64url'),
    );
  }
}
