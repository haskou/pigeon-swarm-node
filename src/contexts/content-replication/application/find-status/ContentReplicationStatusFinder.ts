import { NodePeer } from '@app/contexts/nodes/domain/NodePeer';
import NodePeerRepository from '@app/contexts/nodes/domain/repositories/NodePeerRepository';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { Timestamp } from '@haskou/value-objects';
import { createHash } from 'crypto';

import { ContentReplication } from '../../domain/ContentReplication';
import { ContentReplicationNetworkBudget } from '../../domain/ContentReplicationNetworkBudget';
import ContentReplicationPolicy from '../../domain/ContentReplicationPolicy';
import ContentReplicationRepository from '../../domain/repositories/ContentReplicationRepository';
import ContentReplicationBudgetAllocator from '../../domain/services/ContentReplicationBudgetAllocator';
import { ContentReplicationStatus } from './ContentReplicationStatus';
import { ReplicatedContentStatus } from './ReplicatedContentStatus';

export default class ContentReplicationStatusFinder {
  private static readonly ACTIVE_PEER_WINDOW_MS = 15 * 60 * 1000;

  constructor(
    private readonly contentRepository: ContentReplicationRepository,
    private readonly nodeRepository: NodeRepository,
    private readonly nodePeerRepository: NodePeerRepository,
    private readonly policy: ContentReplicationPolicy,
    private readonly budget: ContentReplicationNetworkBudget,
    private readonly allocator: ContentReplicationBudgetAllocator,
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
    activeNodeIds: string[],
    responsibleNodeIds: string[],
    localNodeId: string,
    withinLocalBudget: boolean,
  ): ReplicatedContentStatus {
    const primitives = content.toPrimitives();

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
          withinLocalBudget,
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

  /**
   * The registration the budget charged for each responsible id it covers.
   * Every owner's registration of a CID competes within that owner's share,
   * so a CID is held when any of its owners' shares covers it; when several
   * do, the largest charged one is kept. Its size caps the fetch, so a CID
   * selected for a small registration is never fetched under a larger one.
   */
  private chargedWithinBudget(
    responsible: ContentReplication[],
  ): Map<string, ContentReplication> {
    const byNetwork = new Map<string, ContentReplication[]>();
    const charged = new Map<string, ContentReplication>();

    responsible.forEach((registration) => {
      const networkId = registration.getNetworkId().valueOf();
      const registrations = byNetwork.get(networkId);

      if (registrations) {
        registrations.push(registration);

        return;
      }

      byNetwork.set(networkId, [registration]);
    });

    byNetwork.forEach((registrations) =>
      this.allocator.select(registrations, this.budget).forEach((selected) => {
        const kept = charged.get(selected.getId());

        if (!kept || kept.getSizeBytes().isLessThan(selected.getSizeBytes())) {
          charged.set(selected.getId(), selected);
        }
      }),
    );

    return charged;
  }

  public async find(): Promise<ContentReplicationStatus> {
    const registrations = await this.contentRepository.findAll();
    const contents = this.distinct(registrations);
    const [localNodeId, activePeers] = await Promise.all([
      this.localNodeId(),
      this.nodePeerRepository.findActive(
        new Date(
          Timestamp.now().toMilliseconds() -
            ContentReplicationStatusFinder.ACTIVE_PEER_WINDOW_MS,
        ),
      ),
    ]);
    const activeNodeIdsByNetwork = this.activeNodeIdsByNetwork(
      localNodeId,
      activePeers,
    );
    const placements = contents.map((content) => {
      const activeNodeIds = activeNodeIdsByNetwork.get(
        content.getNetworkId().valueOf(),
      ) ?? [localNodeId];

      return {
        activeNodeIds,
        content,
        responsibleNodeIds: this.selectResponsibleNodeIds(
          content,
          activeNodeIds,
        ),
      };
    });
    const localResponsibleIds = new Set(
      placements
        .filter(({ responsibleNodeIds }) =>
          responsibleNodeIds.includes(localNodeId),
        )
        .map(({ content }) => content.getId()),
    );
    const charged = this.chargedWithinBudget(
      registrations.filter((registration) =>
        localResponsibleIds.has(registration.getId()),
      ),
    );

    return {
      contents: placements.map(
        ({ activeNodeIds, content, responsibleNodeIds }) =>
          this.buildContentStatus(
            charged.get(content.getId()) ?? content,
            activeNodeIds,
            responsibleNodeIds,
            localNodeId,
            charged.has(content.getId()),
          ),
      ),
      localNodeId,
    };
  }
}
