import { IPFSReplicationStatusSummary } from '@app/contexts/ipfs-replication/domain/IPFSReplicationStatusSummary';
import { IPFSReplicationStatusSummaryRepository } from '@app/contexts/ipfs-replication/domain/repositories/IPFSReplicationStatusSummaryRepository';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import { MongoIPFSReplicationStatusSummaryDocument } from './documents/MongoIPFSReplicationStatusSummaryDocument';

// eslint-disable-next-line max-len
export default class MongoIPFSReplicationStatusSummaryRepository implements IPFSReplicationStatusSummaryRepository {
  private static readonly COLLECTION = 'ipfs_replication_status_summaries';

  constructor(private readonly mongo: MongoDB) {}

  private async collection() {
    return this.mongo.getCollection<MongoIPFSReplicationStatusSummaryDocument>(
      MongoIPFSReplicationStatusSummaryRepository.COLLECTION,
    );
  }

  private toDocument(
    summary: IPFSReplicationStatusSummary,
  ): MongoIPFSReplicationStatusSummaryDocument {
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
    document: MongoIPFSReplicationStatusSummaryDocument,
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
    const document = await (
      await this.collection()
    ).findOne({
      _id: localNodeId.valueOf(),
    });

    return document ? this.toDomain(document) : undefined;
  }

  public async save(summary: IPFSReplicationStatusSummary): Promise<void> {
    const document = this.toDocument(summary);

    await (
      await this.collection()
    ).updateOne({ _id: document._id }, { $set: document }, { upsert: true });
  }
}
