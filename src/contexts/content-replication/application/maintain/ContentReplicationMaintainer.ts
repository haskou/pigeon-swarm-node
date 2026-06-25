import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { DomainEventPublisher } from '@haskou/ddd-kernel/domain';
import { Timestamp } from '@haskou/value-objects';

import { ContentReplicaClaim } from '../../domain/ContentReplicaClaim';
import { ContentReplicationWasClaimedEvent } from '../../domain/events/ContentReplicationWasClaimedEvent';
import ContentReplicaClaimRepository from '../../domain/repositories/ContentReplicaClaimRepository';
import { ContentId } from '../../domain/value-objects/ContentId';
import { ContentReplicationContext } from '../../domain/value-objects/ContentReplicationContext';
import ReplicatedContentStorage from '../content-storage/ReplicatedContentStorage';
import ContentReplicationStatusFinder from '../find-status/ContentReplicationStatusFinder';
import { ReplicatedContentStatus } from '../find-status/ReplicatedContentStatus';
import ContentReplicationStatusSummaryUpdater from '../update-status-summary/ContentReplicationStatusSummaryUpdater';
import { ContentNetworkReplicationStatus } from './ContentNetworkReplicationStatus';
import { ContentReplicationMaintenanceResult } from './ContentReplicationMaintenanceResult';

export default class ContentReplicationMaintainer {
  constructor(
    private readonly finder: ContentReplicationStatusFinder,
    private readonly claimRepository: ContentReplicaClaimRepository,
    private readonly contentStorage: ReplicatedContentStorage,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly summaryUpdater?: ContentReplicationStatusSummaryUpdater,
  ) {}

  private async claimReplica(params: {
    cid: string;
    localNodeId: string;
    networkId: string;
  }): Promise<void> {
    const claimedAt = Timestamp.now();
    const claim = ContentReplicaClaim.create(
      new ContentId(params.cid),
      new NetworkId(params.networkId),
      new NodeId(params.localNodeId),
      claimedAt,
    );

    await this.claimRepository.save(claim);
    await this.eventPublisher.publish([
      new ContentReplicationWasClaimedEvent(params.cid, {
        cid: params.cid,
        claimedAt: claimedAt.valueOf(),
        networkId: params.networkId,
        nodeId: params.localNodeId,
      }),
    ]);
  }

  private hasLocalClaim(
    knownReplicaNodeIds: string[],
    localNodeId: string,
  ): boolean {
    return knownReplicaNodeIds.includes(localNodeId);
  }

  private emptyResult(): ContentReplicationMaintenanceResult {
    return {
      claimedReplicas: 0,
      failedClaims: 0,
      failedReleases: 0,
      releasedReplicas: 0,
    };
  }

  private combineResults(
    current: ContentReplicationMaintenanceResult,
    next: ContentReplicationMaintenanceResult,
  ): ContentReplicationMaintenanceResult {
    return {
      claimedReplicas: current.claimedReplicas + next.claimedReplicas,
      failedClaims: current.failedClaims + next.failedClaims,
      failedReleases: current.failedReleases + next.failedReleases,
      releasedReplicas: current.releasedReplicas + next.releasedReplicas,
    };
  }

  private async maintainResponsibleReplica(
    content: ReplicatedContentStatus,
    network: ContentNetworkReplicationStatus,
    localNodeId: string,
  ): Promise<number> {
    const cid = new ContentId(content.cid);
    const context = new ContentReplicationContext(content.context);
    const networkId = new NetworkId(network.networkId);

    if (context.isPublicUpload()) {
      await this.contentStorage.findBytesInNetwork(cid, networkId);
    } else {
      await this.contentStorage.findJSONInNetwork<unknown>(cid, networkId);
    }

    if (this.hasLocalClaim(network.knownReplicaNodeIds, localNodeId)) {
      return 0;
    }

    await this.claimReplica({
      cid: content.cid,
      localNodeId,
      networkId: network.networkId,
    });

    return 1;
  }

  private async releaseExtraReplica(
    content: ReplicatedContentStatus,
    network: ContentNetworkReplicationStatus,
  ): Promise<number> {
    if (!network.releaseLocalReplica) {
      return 0;
    }

    await this.contentStorage.removeFromNetwork(
      new ContentId(content.cid),
      new NetworkId(network.networkId),
    );

    return 1;
  }

  private async maintainNetwork(
    content: ReplicatedContentStatus,
    network: ContentNetworkReplicationStatus,
    localNodeId: string,
  ): Promise<ContentReplicationMaintenanceResult> {
    const result = this.emptyResult();

    if (network.localResponsible) {
      try {
        result.claimedReplicas = await this.maintainResponsibleReplica(
          content,
          network,
          localNodeId,
        );
      } catch {
        result.failedClaims = 1;
      }

      return result;
    }

    try {
      result.releasedReplicas = await this.releaseExtraReplica(
        content,
        network,
      );
    } catch {
      result.failedReleases = 1;
    }

    return result;
  }

  private async updateSummary(): Promise<void> {
    if (!this.summaryUpdater) {
      return;
    }

    await this.summaryUpdater.updateFromStatus(await this.finder.find());
  }

  public async maintain(): Promise<ContentReplicationMaintenanceResult> {
    const status = await this.finder.find();
    let result = this.emptyResult();

    for (const content of status.contents) {
      for (const network of content.networks) {
        result = this.combineResults(
          result,
          await this.maintainNetwork(content, network, status.localNodeId),
        );
      }
    }

    await this.updateSummary();

    return result;
  }
}
