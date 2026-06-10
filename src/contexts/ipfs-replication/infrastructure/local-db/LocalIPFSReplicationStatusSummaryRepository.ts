import { IPFSReplicationStatusSummary } from '@app/contexts/ipfs-replication/domain/IPFSReplicationStatusSummary';
import IPFSReplicationStatusSummaryRepository from '@app/contexts/ipfs-replication/domain/repositories/IPFSReplicationStatusSummaryRepository';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';

import { LocalIPFSReplicationStatusSummaryDocument } from './documents/LocalIPFSReplicationStatusSummaryDocument';

// eslint-disable-next-line max-len
export default class LocalIPFSReplicationStatusSummaryRepository extends IPFSReplicationStatusSummaryRepository {
  private static readonly NAMESPACE = 'ipfs_replication_status_summaries';

  constructor(private readonly database: EmbeddedLocalDatabase) {
    super();
  }

  private isDocument(
    document: Record<string, unknown>,
  ): document is LocalIPFSReplicationStatusSummaryDocument {
    return (
      typeof document._id === 'string' &&
      typeof document.contentCount === 'number' &&
      typeof document.localResponsibleCount === 'number' &&
      typeof document.releasableCount === 'number' &&
      typeof document.totalSizeBytes === 'number' &&
      typeof document.updatedAt === 'number'
    );
  }

  private toDocument(
    summary: IPFSReplicationStatusSummary,
  ): LocalIPFSReplicationStatusSummaryDocument {
    const primitives = summary.toPrimitives();

    return {
      _id: primitives.localNodeId,
      contentCount: primitives.contentCount,
      localResponsibleCount: primitives.localResponsibleCount,
      releasableCount: primitives.releasableCount,
      totalSizeBytes: primitives.totalSizeBytes,
      updatedAt: primitives.updatedAt,
    };
  }

  private toDomain(
    document: LocalIPFSReplicationStatusSummaryDocument,
  ): IPFSReplicationStatusSummary {
    return IPFSReplicationStatusSummary.fromPrimitives({
      contentCount: document.contentCount,
      localNodeId: document._id,
      localResponsibleCount: document.localResponsibleCount,
      releasableCount: document.releasableCount,
      totalSizeBytes: document.totalSizeBytes,
      updatedAt: document.updatedAt,
    });
  }

  public async findByLocalNodeId(
    localNodeId: NodeId,
  ): Promise<IPFSReplicationStatusSummary | undefined> {
    const document = await this.database.findOne(
      LocalIPFSReplicationStatusSummaryRepository.NAMESPACE,
      localNodeId.valueOf(),
    );

    return document && this.isDocument(document)
      ? this.toDomain(document)
      : undefined;
  }

  public async save(summary: IPFSReplicationStatusSummary): Promise<void> {
    const document = this.toDocument(summary);

    await this.database.save(
      LocalIPFSReplicationStatusSummaryRepository.NAMESPACE,
      document._id,
      document,
    );
  }
}
