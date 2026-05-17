import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import { Timestamp } from '@haskou/value-objects';

import { IPFSContentReplicaClaim } from '../../domain/IPFSContentReplicaClaim';
import { IPFSContentReplicaClaimRepository } from '../../domain/repositories/IPFSContentReplicaClaimRepository';

export default class IPFSContentReplicaClaimRegistrar {
  constructor(private readonly repository: IPFSContentReplicaClaimRepository) {}

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

    return claim;
  }
}
