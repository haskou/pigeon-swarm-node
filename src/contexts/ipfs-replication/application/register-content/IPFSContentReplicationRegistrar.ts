import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';

import { IPFSContentReplication } from '../../domain/IPFSContentReplication';
import { IPFSContentReplicationRepository } from '../../domain/repositories/IPFSContentReplicationRepository';
import { IPFSContentReplicationContext } from '../../domain/value-objects/IPFSContentReplicationContext';
import { IPFSContentReplicationPriority } from '../../domain/value-objects/IPFSContentReplicationPriority';
import { IPFSContentSize } from '../../domain/value-objects/IPFSContentSize';

export default class IPFSContentReplicationRegistrar {
  constructor(private readonly repository: IPFSContentReplicationRepository) {}

  public async register(params: {
    cid: string;
    context: string;
    networkIds: string[];
    ownerIdentityId?: string;
    priority?: IPFSContentReplicationPriority;
    sizeBytes: number;
  }): Promise<IPFSContentReplication> {
    const cid = new IPFSId(params.cid);
    const existing = await this.repository.findByCid(cid);

    if (existing) {
      existing.touch();
      await this.repository.save(existing);

      return existing;
    }

    const content = IPFSContentReplication.create(
      cid,
      new IPFSContentReplicationContext(params.context),
      params.networkIds.map((networkId) => new NetworkId(networkId)),
      new IPFSContentSize(params.sizeBytes),
      params.ownerIdentityId
        ? new IdentityId(params.ownerIdentityId)
        : undefined,
      params.priority ?? IPFSContentReplicationPriority.NORMAL,
    );

    await this.repository.save(content);

    return content;
  }
}
