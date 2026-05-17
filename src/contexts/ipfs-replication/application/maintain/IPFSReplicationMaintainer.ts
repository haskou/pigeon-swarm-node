import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import { Timestamp } from '@haskou/value-objects';

import { IPFSContentReplicationWasClaimedEvent } from '../../domain/events/IPFSContentReplicationWasClaimedEvent';
import { IPFSContentReplicaClaim } from '../../domain/IPFSContentReplicaClaim';
import { IPFSContentReplicaClaimRepository } from '../../domain/repositories/IPFSContentReplicaClaimRepository';
import IPFSReplicationStatusFinder, {
  IPFSContentReplicationStatus,
} from '../find-status/IPFSReplicationStatusFinder';

export type IPFSReplicationMaintenanceResult = {
  claimedReplicas: number;
  releasedReplicas: number;
};

export default class IPFSReplicationMaintainer {
  constructor(
    private readonly finder: IPFSReplicationStatusFinder,
    private readonly claimRepository: IPFSContentReplicaClaimRepository,
    private readonly ipfs: IPFS,
    private readonly eventPublisher: DomainEventPublisher,
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

  private async maintainResponsibleReplica(
    content: IPFSContentReplicationStatus,
    network: IPFSContentReplicationStatus['networks'][number],
    localNodeId: string,
  ): Promise<number> {
    const cid = new IPFSId(content.cid);

    await this.ipfs.getJSONFromNetwork<unknown>(cid, network.networkId);

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
    network: IPFSContentReplicationStatus['networks'][number],
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

  public async maintain(): Promise<IPFSReplicationMaintenanceResult> {
    const status = await this.finder.find();
    let claimedReplicas = 0;
    let releasedReplicas = 0;

    for (const content of status.contents) {
      for (const network of content.networks) {
        if (network.localResponsible) {
          claimedReplicas += await this.maintainResponsibleReplica(
            content,
            network,
            status.localNodeId,
          );

          continue;
        }

        releasedReplicas += await this.releaseExtraReplica(content, network);
      }
    }

    return { claimedReplicas, releasedReplicas };
  }
}
