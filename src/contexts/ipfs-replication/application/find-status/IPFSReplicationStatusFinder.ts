import { NodePeer } from '@app/contexts/nodes/domain/NodePeer';
import { NodePeerRepository } from '@app/contexts/nodes/domain/repositories/NodePeerRepository';
import { NodeRepository } from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { createHash } from 'crypto';

import { IPFSContentReplication } from '../../domain/IPFSContentReplication';
import { IPFSReplicationPolicy } from '../../domain/IPFSReplicationPolicy';
import { IPFSContentReplicationRepository } from '../../domain/repositories/IPFSContentReplicationRepository';

type NetworkReplicationStatus = {
  activeNodeCount: number;
  desiredReplicas: number;
  localResponsible: boolean;
  networkId: string;
  responsibleNodeIds: string[];
};

export type IPFSContentReplicationStatus = {
  cid: string;
  context: string;
  createdAt: number;
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
    private readonly nodeRepository: NodeRepository,
    private readonly nodePeerRepository: NodePeerRepository,
    policy?: IPFSReplicationPolicy,
  ) {
    this.policy = policy ?? new IPFSReplicationPolicy();
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

      return {
        activeNodeCount: activeNodeIds.length,
        desiredReplicas: this.policy.desiredReplicas(activeNodeIds.length),
        localResponsible: responsibleNodeIds.includes(localNodeId),
        networkId,
        responsibleNodeIds,
      };
    });

    return {
      cid: primitives.cid,
      context: primitives.context,
      createdAt: primitives.createdAt,
      networks,
      ownerIdentityId: primitives.ownerIdentityId,
      priority: primitives.priority,
      sizeBytes: primitives.sizeBytes,
      updatedAt: primitives.updatedAt,
    };
  }

  public async find(): Promise<IPFSReplicationStatus> {
    const [contents, localNode, activePeers] = await Promise.all([
      this.contentRepository.findAll(),
      this.nodeRepository.loadLocalNode(),
      this.nodePeerRepository.findActive(
        new Date(
          Date.now() - IPFSReplicationStatusFinder.ACTIVE_PEER_WINDOW_MS,
        ),
      ),
    ]);
    const localNodeId = localNode.toPrimitives().id;
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
