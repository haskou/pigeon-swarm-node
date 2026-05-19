import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import { Timestamp } from '@haskou/value-objects';

import { IPFSContentReplicaClaim } from '../../domain/IPFSContentReplicaClaim';
import { IPFSContentReplicaClaimRepository } from '../../domain/repositories/IPFSContentReplicaClaimRepository';
import IPFSReplicationStatusSummaryRefresher from '../refresh-status-summary/IPFSReplicationStatusSummaryRefresher';

export default class IPFSContentReplicaClaimRegistrar {
  constructor(
    private readonly repository: IPFSContentReplicaClaimRepository,
    private readonly summaryRefresher?: IPFSReplicationStatusSummaryRefresher,
  ) {}

  public async register(params: {
    cid: string;
    claimedAt?: number;
    networkId: string;
    nodeId: string;
  }): Promise<IPFSContentReplicaClaim> {
    const claim = IPFSContentReplicaClaim.create(
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
