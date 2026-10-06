import { NodePeer } from '@app/contexts/nodes/domain/NodePeer';
import NodePeerRepository from '@app/contexts/nodes/domain/repositories/NodePeerRepository';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { createHash } from 'crypto';

import { ContentReplication } from '../../domain/ContentReplication';
import ContentReplicationPolicy from '../../domain/ContentReplicationPolicy';
import ContentReplicationRepository from '../../domain/repositories/ContentReplicationRepository';
import { ContentReplicationStatus } from './ContentReplicationStatus';
import { ReplicatedContentStatus } from './ReplicatedContentStatus';

export default class ContentReplicationStatusFinder {
  private static readonly ACTIVE_PEER_WINDOW_MS = 15 * 60 * 1000;

  constructor(
    private readonly contentRepository: ContentReplicationRepository,
    private readonly nodeRepository: NodeRepository,
    private readonly nodePeerRepository: NodePeerRepository,
    private readonly policy: ContentReplicationPolicy,
  ) {}

  private async localNodeId(): Promise<string> {
    return (await this.nodeRepository.loadLocalNodeId()).valueOf();
  }

  private score(cid: string, nodeId: string, networkId: string): string {
    return createHash('sha256')
      .update(`${networkId}:${cid}:${nodeId}`)
      .digest('hex');
  }

  private activeNodeIdsByNetwork(
    localNodeId: string,
    peers: NodePeer[],
  ): Map<string, string[]> {
    const activeNodeIdsByNetwork = new Map<string, Set<string>>();

    for (const peer of peers) {
      const primitives = peer.toPrimitives();

      for (const network of primitives.networks) {
        const nodeIds =
          activeNodeIdsByNetwork.get(network.id) ?? new Set<string>();

        nodeIds.add(primitives.id);
        activeNodeIdsByNetwork.set(network.id, nodeIds);
      }
    }

    return new Map(
      [...activeNodeIdsByNetwork.entries()].map(([networkId, nodeIds]) => [
        networkId,
        [...new Set([localNodeId, ...nodeIds])].sort(),
      ]),
    );
  }

  private selectResponsibleNodeIds(
    content: ContentReplication,
    nodeIds: string[],
  ): string[] {
    const primitives = content.toPrimitives();
    const desiredReplicas = this.policy.desiredReplicas(nodeIds.length);

    return [...nodeIds]
      .sort((firstNodeId, secondNodeId) =>
        this.score(
          primitives.cid,
          secondNodeId,
          primitives.networkId,
        ).localeCompare(
          this.score(primitives.cid, firstNodeId, primitives.networkId),
        ),
      )
      .slice(0, desiredReplicas)
      .sort();
  }

  private buildContentStatus(
    content: ContentReplication,
    localNodeId: string,
    activeNodeIdsByNetwork: Map<string, string[]>,
  ): ReplicatedContentStatus {
    const primitives = content.toPrimitives();
    const activeNodeIds = activeNodeIdsByNetwork.get(primitives.networkId) ?? [
      localNodeId,
    ];
    const responsibleNodeIds = this.selectResponsibleNodeIds(
      content,
      activeNodeIds,
    );

    return {
      cid: primitives.cid,
      context: primitives.context,
      networks: [
        {
          activeNodeCount: activeNodeIds.length,
          desiredReplicas: this.policy.desiredReplicas(activeNodeIds.length),
          localResponsible: responsibleNodeIds.includes(localNodeId),
          networkId: primitives.networkId,
          responsibleNodeIds,
        },
      ],
      sizeBytes: primitives.sizeBytes,
    };
  }

  /** Several owners may register the same CID in a network: it is held once. */
  private distinct(contents: ContentReplication[]): ContentReplication[] {
    return [
      ...new Map(
        contents.map((content) => [content.getId(), content]),
      ).values(),
    ];
  }

  public async find(): Promise<ContentReplicationStatus> {
    const contents = this.distinct(await this.contentRepository.findAll());
    const [localNodeId, activePeers] = await Promise.all([
      this.localNodeId(),
      this.nodePeerRepository.findActive(
        new Date(
          Date.now() - ContentReplicationStatusFinder.ACTIVE_PEER_WINDOW_MS,
        ),
      ),
    ]);
    const activeNodeIdsByNetwork = this.activeNodeIdsByNetwork(
      localNodeId,
      activePeers,
    );

    return {
      contents: contents.map((content) =>
        this.buildContentStatus(content, localNodeId, activeNodeIdsByNetwork),
      ),
      localNodeId,
    };
  }
}
