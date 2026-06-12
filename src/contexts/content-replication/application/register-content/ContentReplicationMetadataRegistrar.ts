import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import { Timestamp } from '@haskou/value-objects';

import { ContentReplication } from '../../domain/ContentReplication';
import ContentReplicationRepository from '../../domain/repositories/ContentReplicationRepository';
import { ContentReplicationContext } from '../../domain/value-objects/ContentReplicationContext';
import { ContentReplicationMetadata } from '../../domain/value-objects/ContentReplicationMetadata';
import { ContentReplicationPriority } from '../../domain/value-objects/ContentReplicationPriority';
import ContentReplicationSummaryRefresher from '../refresh-status-summary/ContentReplicationSummaryRefresher';

export default class ContentReplicationMetadataRegistrar {
  constructor(
    private readonly repository: ContentReplicationRepository,
    private readonly summaryRefresher?: ContentReplicationSummaryRefresher,
  ) {}

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
  }): Promise<ContentReplication> {
    const cid = new IPFSId(params.cid);
    const existing = await this.repository.findByCid(cid);
    const networkIds = params.networkIds.map(
      (networkId) => new NetworkId(networkId),
    );

    if (existing) {
      existing.addNetworkIds(networkIds);
      existing.updateMetadata(
        ContentReplicationMetadata.fromPrimitives(
          params.sizeBytes,
          params.contentType,
          params.filename,
        ),
      );
      existing.touch(
        params.updatedAt ? new Timestamp(params.updatedAt) : Timestamp.now(),
      );
      await this.repository.save(existing);
      await this.summaryRefresher?.refresh();

      return existing;
    }

    const content = ContentReplication.create(
      cid,
      new ContentReplicationContext(params.context),
      networkIds,
      ContentReplicationMetadata.fromPrimitives(
        params.sizeBytes,
        params.contentType,
        params.filename,
      ),
      params.ownerIdentityId
        ? new IdentityId(params.ownerIdentityId)
        : undefined,
      ContentReplicationPriority.fromValue(params.priority),
      params.createdAt ? new Timestamp(params.createdAt) : Timestamp.now(),
    );

    if (params.updatedAt) {
      content.touch(new Timestamp(params.updatedAt));
    }

    await this.repository.save(content);
    await this.summaryRefresher?.refresh();

    return content;
  }
}
