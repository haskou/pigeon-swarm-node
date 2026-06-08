import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import { Timestamp } from '@haskou/value-objects';

import { IPFSContentReplicationWasClaimedEvent } from '../../domain/events/IPFSContentReplicationWasClaimedEvent';
import { IPFSContentReplicaClaim } from '../../domain/IPFSContentReplicaClaim';
import { IPFSContentReplicaClaimRepository } from '../../domain/repositories/IPFSContentReplicaClaimRepository';
import { IPFSContentReplicationContext } from '../../domain/value-objects/IPFSContentReplicationContext';
import IPFSReplicationStatusFinder from '../find-status/IPFSReplicationStatusFinder';
import { IPFSContentReplicationStatus } from '../find-status/types/IPFSContentReplicationStatus';
import IPFSReplicationStatusSummaryUpdater from '../update-status-summary/IPFSReplicationStatusSummaryUpdater';
import { IPFSContentNetworkReplicationStatus } from './types/IPFSContentNetworkReplicationStatus';
import { IPFSReplicationMaintenanceResult } from './types/IPFSReplicationMaintenanceResult';

export default class IPFSReplicationMaintainer {
  private static readonly DEFAULT_CLAIM_TIMEOUT_MS = 3000;

  constructor(
    private readonly finder: IPFSReplicationStatusFinder,
    private readonly claimRepository: IPFSContentReplicaClaimRepository,
    private readonly ipfs: IPFS,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly summaryUpdater?: IPFSReplicationStatusSummaryUpdater,
  ) {}

  private async claimReplica(params: {
    cid: string;
    localNodeId: string;
    networkId: string;
  }): Promise<void> {
    const claimedAt = Timestamp.now();
    const claim = IPFSContentReplicaClaim.create(
      new IPFSId(params.cid),
      new NetworkId(params.networkId),
      new NodeId(params.localNodeId),
      claimedAt,
    );

    await this.claimRepository.save(claim);
    await this.eventPublisher.publish([
      new IPFSContentReplicationWasClaimedEvent(params.cid, {
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

  private emptyResult(): IPFSReplicationMaintenanceResult {
    return {
      claimedReplicas: 0,
      failedClaims: 0,
      failedReleases: 0,
      releasedReplicas: 0,
    };
  }

  private contentClaimTimeoutMs(): number {
    return Number(
      process.env.IPFS_REPLICATION_CLAIM_TIMEOUT_MS ??
        process.env.IPFS_CONTENT_TIMEOUT_MS ??
        IPFSReplicationMaintainer.DEFAULT_CLAIM_TIMEOUT_MS,
    );
  }

  private createClaimAbortSignal(): {
    controller: AbortController;
    signal: AbortSignal;
  } {
    const controller = new AbortController();

    return {
      controller,
      signal: controller.signal,
    };
  }

  private claimTimeoutPromise(
    abort: {
      controller: AbortController;
      signal: AbortSignal;
    },
    timeoutMs: number,
  ): {
    promise: Promise<never>;
    timeout: ReturnType<typeof setTimeout>;
  } {
    let timeout: ReturnType<typeof setTimeout>;
    const promise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        abort.controller.abort();
        reject(new Error('IPFS replica claim fetch timed out.'));
      }, timeoutMs);
      timeout.unref?.();
    });

    return {
      promise,
      timeout: timeout!,
    };
  }

  private async fetchResponsibleReplica(
    content: IPFSContentReplicationStatus,
    network: IPFSContentNetworkReplicationStatus,
  ): Promise<void> {
    const cid = new IPFSId(content.cid);
    const context = new IPFSContentReplicationContext(content.context);
    const abort = this.createClaimAbortSignal();
    const timeoutMs = this.contentClaimTimeoutMs();
    const claimTimeout = this.claimTimeoutPromise(abort, timeoutMs);
    let fetch: Promise<unknown>;

    if (context.isPublicUpload()) {
      fetch = this.ipfs.getBytesFromNetwork(
        cid,
        network.networkId,
        abort.signal,
      );
    } else {
      fetch = this.ipfs.getJSONFromNetwork<unknown>(
        cid,
        network.networkId,
        abort.signal,
      );
    }

    try {
      await Promise.race([fetch, claimTimeout.promise]);
    } finally {
      clearTimeout(claimTimeout.timeout);
      fetch.catch((): void => undefined);
    }
  }

  private combineResults(
    current: IPFSReplicationMaintenanceResult,
    next: IPFSReplicationMaintenanceResult,
  ): IPFSReplicationMaintenanceResult {
    return {
      claimedReplicas: current.claimedReplicas + next.claimedReplicas,
      failedClaims: current.failedClaims + next.failedClaims,
      failedReleases: current.failedReleases + next.failedReleases,
      releasedReplicas: current.releasedReplicas + next.releasedReplicas,
    };
  }

  private async maintainResponsibleReplica(
    content: IPFSContentReplicationStatus,
    network: IPFSContentNetworkReplicationStatus,
    localNodeId: string,
  ): Promise<number> {
    await this.fetchResponsibleReplica(content, network);

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
    content: IPFSContentReplicationStatus,
    network: IPFSContentNetworkReplicationStatus,
  ): Promise<number> {
    if (!network.releaseLocalReplica) {
      return 0;
    }

    await this.ipfs.removeJSONFromNetwork(
      new IPFSId(content.cid),
      network.networkId,
    );

    return 1;
  }

  private async maintainNetwork(
    content: IPFSContentReplicationStatus,
    network: IPFSContentNetworkReplicationStatus,
    localNodeId: string,
  ): Promise<IPFSReplicationMaintenanceResult> {
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

  public async maintain(): Promise<IPFSReplicationMaintenanceResult> {
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
