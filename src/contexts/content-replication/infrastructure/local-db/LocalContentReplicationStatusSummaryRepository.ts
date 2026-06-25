import { ContentReplicationStatusSummary } from '@app/contexts/content-replication/domain/ContentReplicationStatusSummary';
import ContentReplicationStatusSummaryRepository from '@app/contexts/content-replication/domain/repositories/ContentReplicationStatusSummaryRepository';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';

import { LocalContentReplicationStatusSummaryDocument } from './documents/LocalContentReplicationStatusSummaryDocument';

export default class LocalContentReplicationStatusSummaryRepository extends ContentReplicationStatusSummaryRepository {
  private static readonly NAMESPACE = 'content_replication_status_summaries';

  constructor(private readonly database: EmbeddedLocalDatabase) {
    super();
  }

  private isDocument(
    document: Record<string, unknown>,
  ): document is LocalContentReplicationStatusSummaryDocument {
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
    summary: ContentReplicationStatusSummary,
  ): LocalContentReplicationStatusSummaryDocument {
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
    document: LocalContentReplicationStatusSummaryDocument,
  ): ContentReplicationStatusSummary {
    return ContentReplicationStatusSummary.fromPrimitives({
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
  ): Promise<ContentReplicationStatusSummary> {
    const document = await this.database.findOne(
      LocalContentReplicationStatusSummaryRepository.NAMESPACE,
      localNodeId.valueOf(),
    );

    return document && this.isDocument(document)
      ? this.toDomain(document)
      : ContentReplicationStatusSummary.empty(localNodeId);
  }

  public async save(summary: ContentReplicationStatusSummary): Promise<void> {
    const document = this.toDocument(summary);

    await this.database.save(
      LocalContentReplicationStatusSummaryRepository.NAMESPACE,
      document._id,
      document,
    );
  }
}
