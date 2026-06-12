import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import { Timestamp } from '@haskou/value-objects';

import { ContentReplicaClaim } from '../../domain/ContentReplicaClaim';
import ContentReplicaClaimRepository from '../../domain/repositories/ContentReplicaClaimRepository';
import ContentReplicationSummaryRefresher from '../refresh-status-summary/ContentReplicationSummaryRefresher';

export default class ContentReplicaClaimRegistrar {
  constructor(
    private readonly repository: ContentReplicaClaimRepository,
    private readonly summaryRefresher?: ContentReplicationSummaryRefresher,
  ) {}

  public async register(params: {
    cid: string;
    claimedAt?: number;
    networkId: string;
    nodeId: string;
  }): Promise<ContentReplicaClaim> {
    const claim = ContentReplicaClaim.create(
      new IPFSId(params.cid),
      new NetworkId(params.networkId),
      new NodeId(params.nodeId),
      params.claimedAt ? new Timestamp(params.claimedAt) : Timestamp.now(),
    );

    await this.repository.save(claim);
    await this.summaryRefresher?.refresh();

    return claim;
  }
}
