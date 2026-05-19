import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import { Timestamp } from '@haskou/value-objects';

import { IPFSContentReplication } from '../../domain/IPFSContentReplication';
import { IPFSContentReplicationRepository } from '../../domain/repositories/IPFSContentReplicationRepository';
import { IPFSContentReplicationContext } from '../../domain/value-objects/IPFSContentReplicationContext';
import { IPFSContentReplicationMetadata } from '../../domain/value-objects/IPFSContentReplicationMetadata';
import { IPFSContentReplicationPriority } from '../../domain/value-objects/IPFSContentReplicationPriority';

export default class IPFSContentReplicationMetadataRegistrar {
  constructor(private readonly repository: IPFSContentReplicationRepository) {}

  public async register(params: {
    cid: string;
    contentType?: string;
    context: string;
    createdAt?: number;
    filename?: string;
    networkIds: string[];
    ownerIdentityId?: string;
    priority: string;
    sizeBytes: number;
    updatedAt?: number;
  }): Promise<IPFSContentReplication> {
    const cid = new IPFSId(params.cid);
    const existing = await this.repository.findByCid(cid);
    const networkIds = params.networkIds.map(
      (networkId) => new NetworkId(networkId),
    );

    if (existing) {
      existing.addNetworkIds(networkIds);
      existing.updateMetadata(
        IPFSContentReplicationMetadata.fromPrimitives(
          params.sizeBytes,
          params.contentType,
          params.filename,
        ),
      );
      existing.touch(
        params.updatedAt ? new Timestamp(params.updatedAt) : Timestamp.now(),
      );
      await this.repository.save(existing);

      return existing;
    }

    const content = IPFSContentReplication.create(
      cid,
      new IPFSContentReplicationContext(params.context),
      networkIds,
      IPFSContentReplicationMetadata.fromPrimitives(
        params.sizeBytes,
        params.contentType,
        params.filename,
      ),
      params.ownerIdentityId
        ? new IdentityId(params.ownerIdentityId)
        : undefined,
      IPFSContentReplicationPriority.fromValue(params.priority),
      params.createdAt ? new Timestamp(params.createdAt) : Timestamp.now(),
    );

    if (params.updatedAt) {
      content.touch(new Timestamp(params.updatedAt));
    }

    await this.repository.save(content);

    return content;
  }
}
