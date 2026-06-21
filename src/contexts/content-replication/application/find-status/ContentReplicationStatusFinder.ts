import { NodePeer } from '@app/contexts/nodes/domain/NodePeer';
import NodePeerRepository from '@app/contexts/nodes/domain/repositories/NodePeerRepository';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { createHash } from 'crypto';

import { ContentReplicaClaim } from '../../domain/ContentReplicaClaim';
import { ContentReplication } from '../../domain/ContentReplication';
import ContentReplicationPolicy from '../../domain/ContentReplicationPolicy';
import ContentReplicaClaimRepository from '../../domain/repositories/ContentReplicaClaimRepository';
import ContentReplicationRepository from '../../domain/repositories/ContentReplicationRepository';
import { ContentReplicationStatus } from './ContentReplicationStatus';
import { ReplicatedContentStatus } from './ReplicatedContentStatus';

export default class ContentReplicationStatusFinder {
  private static readonly ACTIVE_PEER_WINDOW_MS = 15 * 60 * 1000;

  constructor(
    private readonly contentRepository: ContentReplicationRepository,
    private readonly claimRepository: ContentReplicaClaimRepository,
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
    networkId: string,
    nodeIds: string[],
  ): string[] {
    const primitives = content.toPrimitives();
    const desiredReplicas = this.policy.desiredReplicas(nodeIds.length);

    return [...nodeIds]
      .sort((firstNodeId, secondNodeId) =>
        this.score(primitives.cid, secondNodeId, networkId).localeCompare(
          this.score(primitives.cid, firstNodeId, networkId),
        ),
      )
      .slice(0, desiredReplicas)
      .sort();
  }

  private buildContentStatus(
    content: ContentReplication,
    claims: ContentReplicaClaim[],
    localNodeId: string,
    activeNodeIdsByNetwork: Map<string, string[]>,
  ): ReplicatedContentStatus {
    const primitives = content.toPrimitives();
    const networks = primitives.networkIds.map((networkId) => {
      const activeNodeIds = activeNodeIdsByNetwork.get(networkId) ?? [
        localNodeId,
      ];
      const responsibleNodeIds = this.selectResponsibleNodeIds(
        content,
        networkId,
        activeNodeIds,
      );
      const knownReplicaNodeIds = claims
        .map((claim) => claim.toPrimitives())
        .filter(
          (claim) =>
            claim.cid === primitives.cid && claim.networkId === networkId,
        )
        .map((claim) => claim.nodeId)
        .sort();

      return {
        activeNodeCount: activeNodeIds.length,
        desiredReplicas: this.policy.desiredReplicas(activeNodeIds.length),
        knownReplicaNodeIds,
        knownReplicas: knownReplicaNodeIds.length,
        localResponsible: responsibleNodeIds.includes(localNodeId),
        networkId,
        releaseLocalReplica: this.policy.canReleaseLocalReplica({
          activeNodeCount: activeNodeIds.length,
          knownReplicaNodeIds,
          localNodeId,
          responsibleNodeIds,
        }),
        responsibleNodeIds,
      };
    });

    return {
      cid: primitives.cid,
      contentType: primitives.contentType,
      context: primitives.context,
      createdAt: primitives.createdAt,
      filename: primitives.filename,
      networks,
      ownerIdentityId: primitives.ownerIdentityId,
      priority: primitives.priority,
      sizeBytes: primitives.sizeBytes,
      updatedAt: primitives.updatedAt,
    };
  }

  public async find(): Promise<ContentReplicationStatus> {
    const contents = await this.contentRepository.findAll();
    const [claims, localNodeId, activePeers] = await Promise.all([
      this.claimRepository.findByCids(
        contents.map((content) => content.getCid()),
      ),
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
        this.buildContentStatus(
          content,
          claims,
          localNodeId,
          activeNodeIdsByNetwork,
        ),
      ),
      localNodeId,
    };
  }
}
