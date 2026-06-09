import { IPFSContentReplication } from '@app/contexts/ipfs-replication/domain/IPFSContentReplication';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import { OrbitDBReplicatedStateRegistry } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import { MongoIPFSContentReplicationDocument } from './documents/MongoIPFSContentReplicationDocument';

export default class MongoIPFSContentReplicationRepository {
  private static readonly COLLECTION = 'ipfs_content_replication';

  constructor(private readonly mongo: MongoDB) {}

  private async collection() {
    return this.mongo.getCollection<MongoIPFSContentReplicationDocument>(
      MongoIPFSContentReplicationRepository.COLLECTION,
    );
  }

  private arrayValue(
    document: Record<string, unknown>,
    attribute: string,
  ): unknown[] | undefined {
    const value = document[attribute];

    return Array.isArray(value) ? value : undefined;
  }

  private numberValue(
    document: Record<string, unknown>,
    attribute: string,
  ): number | undefined {
    const value = document[attribute];

    return typeof value === 'number' ? value : undefined;
  }

  private stringValue(
    document: Record<string, unknown>,
    attribute: string,
  ): string | undefined {
    const value = document[attribute];

    return typeof value === 'string' ? value : undefined;
  }

  private documentFromReplicatedDocument(
    document: Record<string, unknown>,
  ): MongoIPFSContentReplicationDocument | undefined {
    const cid = this.stringValue(document, 'cid');
    const context = this.stringValue(document, 'context');
    const createdAt = this.numberValue(document, 'createdAt');
    const networkIds = this.arrayValue(document, 'networkIds');
    const priority = this.stringValue(document, 'priority');
    const sizeBytes = this.numberValue(document, 'sizeBytes');
    const updatedAt = this.numberValue(document, 'updatedAt');

    if (
      !cid ||
      !context ||
      !createdAt ||
      !networkIds ||
      !priority ||
      sizeBytes === undefined ||
      !updatedAt
    ) {
      return undefined;
    }

    return {
      _id: cid,
      contentType: this.stringValue(document, 'contentType'),
      context,
      createdAt,
      filename: this.stringValue(document, 'filename'),
      networkIds: networkIds as string[],
      ownerIdentityId: this.stringValue(document, 'ownerIdentityId'),
      priority: priority as MongoIPFSContentReplicationDocument['priority'],
      sizeBytes,
      updatedAt,
    };
  }

  private async findReplicatedDocuments(
    matcher: (document: Record<string, unknown>) => boolean,
  ): Promise<MongoIPFSContentReplicationDocument[]> {
    try {
      const documents =
        await OrbitDBReplicatedStateRegistry.shared().queryDocuments(
          'ipfsReplication',
          matcher,
        );

      return documents
        .map((document) => this.documentFromReplicatedDocument(document))
        .filter(
          (document): document is MongoIPFSContentReplicationDocument =>
            document !== undefined,
        );
    } catch {
      return [];
    }
  }

  private deduplicateDocuments(
    documents: MongoIPFSContentReplicationDocument[],
  ): MongoIPFSContentReplicationDocument[] {
    const deduplicated = new Map<string, MongoIPFSContentReplicationDocument>();

    for (const document of documents) {
      deduplicated.set(document._id, document);
    }

    return [...deduplicated.values()];
  }

  private toDocument(
    content: IPFSContentReplication,
  ): MongoIPFSContentReplicationDocument {
    const primitives = content.toPrimitives();

    return {
      _id: primitives.cid,
      contentType: primitives.contentType,
      context: primitives.context,
      createdAt: primitives.createdAt,
      filename: primitives.filename,
      networkIds: primitives.networkIds,
      ownerIdentityId: primitives.ownerIdentityId,
      priority: primitives.priority,
      sizeBytes: primitives.sizeBytes,
      updatedAt: primitives.updatedAt,
    };
  }

  private toDomain(
    document: MongoIPFSContentReplicationDocument,
  ): IPFSContentReplication {
    return IPFSContentReplication.fromPrimitives({
      cid: document._id,
      contentType: document.contentType,
      context: document.context,
      createdAt: document.createdAt,
      filename: document.filename,
      networkIds: document.networkIds,
      ownerIdentityId: document.ownerIdentityId,
      priority: document.priority,
      sizeBytes: document.sizeBytes,
      updatedAt: document.updatedAt,
    });
  }

  public async findAll(): Promise<IPFSContentReplication[]> {
    const documents = await (await this.collection())
      .find()
      .sort({ updatedAt: -1 })
      .toArray();
    const replicatedDocuments = await this.findReplicatedDocuments(() => true);

    return this.deduplicateDocuments([...documents, ...replicatedDocuments])
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map((document) => this.toDomain(document));
  }

  public async findByCid(
    cid: IPFSId,
  ): Promise<IPFSContentReplication | undefined> {
    const document = await (
      await this.collection()
    ).findOne({
      _id: cid.valueOf(),
    });

    if (document) {
      return this.toDomain(document);
    }

    const [replicatedDocument] = await this.findReplicatedDocuments(
      (candidate) => this.stringValue(candidate, 'cid') === cid.valueOf(),
    );

    return replicatedDocument ? this.toDomain(replicatedDocument) : undefined;
  }

  public async save(content: IPFSContentReplication): Promise<void> {
    const document = this.toDocument(content);

    await (
      await this.collection()
    ).updateOne({ _id: document._id }, { $set: document }, { upsert: true });
  }
}
