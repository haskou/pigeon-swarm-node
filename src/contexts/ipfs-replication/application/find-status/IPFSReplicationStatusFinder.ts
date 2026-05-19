import { NodePeer } from '@app/contexts/nodes/domain/NodePeer';
import { NodePeerRepository } from '@app/contexts/nodes/domain/repositories/NodePeerRepository';
import { NodeRepository } from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { createHash } from 'crypto';

import { IPFSContentReplicaClaim } from '../../domain/IPFSContentReplicaClaim';
import { IPFSContentReplication } from '../../domain/IPFSContentReplication';
import { IPFSReplicationPolicy } from '../../domain/IPFSReplicationPolicy';
import { IPFSContentReplicaClaimRepository } from '../../domain/repositories/IPFSContentReplicaClaimRepository';
import { IPFSContentReplicationRepository } from '../../domain/repositories/IPFSContentReplicationRepository';

type NodeRepositoryWithLocalNodeId = NodeRepository & {
  loadLocalNodeId?(): Promise<{
    valueOf(): string;
  }>;
};
type NetworkReplicationStatus = {
  activeNodeCount: number;
  desiredReplicas: number;
  knownReplicaNodeIds: string[];
  knownReplicas: number;
  localResponsible: boolean;
  networkId: string;
  releaseLocalReplica: boolean;
  responsibleNodeIds: string[];
};

export type IPFSContentReplicationStatus = {
  cid: string;
  contentType: string;
  context: string;
  createdAt: number;
  filename?: string;
  networks: NetworkReplicationStatus[];
  ownerIdentityId?: string;
  priority: string;
  sizeBytes: number;
  updatedAt: number;
};

export type IPFSReplicationStatus = {
  contents: IPFSContentReplicationStatus[];
  localNodeId: string;
};

export default class IPFSReplicationStatusFinder {
  private static readonly ACTIVE_PEER_WINDOW_MS = 15 * 60 * 1000;

  private readonly policy: IPFSReplicationPolicy;

  constructor(
    private readonly contentRepository: IPFSContentReplicationRepository,
    private readonly claimRepository: IPFSContentReplicaClaimRepository,
    private readonly nodeRepository: NodeRepositoryWithLocalNodeId,
    private readonly nodePeerRepository: NodePeerRepository,
    policy?: IPFSReplicationPolicy,
  ) {
    this.policy = policy ?? new IPFSReplicationPolicy();
  }

  private async localNodeId(): Promise<string> {
    if (this.nodeRepository.loadLocalNodeId) {
      return (await this.nodeRepository.loadLocalNodeId()).valueOf();
    }

    return (await this.nodeRepository.loadLocalNode()).toPrimitives().id;
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
    content: IPFSContentReplication,
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
    content: IPFSContentReplication,
    claims: IPFSContentReplicaClaim[],
    localNodeId: string,
    activeNodeIdsByNetwork: Map<string, string[]>,
  ): IPFSContentReplicationStatus {
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

  public async find(): Promise<IPFSReplicationStatus> {
    const contents = await this.contentRepository.findAll();
    const [claims, localNodeId, activePeers] = await Promise.all([
      this.claimRepository.findByCids(
        contents.map((content) => content.getCid()),
      ),
      this.localNodeId(),
      this.nodePeerRepository.findActive(
        new Date(
          Date.now() - IPFSReplicationStatusFinder.ACTIVE_PEER_WINDOW_MS,
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
