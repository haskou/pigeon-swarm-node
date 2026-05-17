import { IPFSReplicationStatus } from '@app/contexts/ipfs-replication/application/find-status/IPFSReplicationStatusFinder';

import { IPFSReplicationStatusResource } from '../resources/IPFSReplicationStatusResource';

export class IPFSReplicationStatusViewModel {
  constructor(private readonly status: IPFSReplicationStatus) {}

  public toResource(): IPFSReplicationStatusResource {
    return this.status;
  }
}
