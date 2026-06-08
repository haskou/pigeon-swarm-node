import { IPFSContentReplication } from '@app/contexts/ipfs-replication/domain/IPFSContentReplication';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
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

    return documents.map((document) => this.toDomain(document));
  }

  public async findByCid(
    cid: IPFSId,
  ): Promise<IPFSContentReplication | undefined> {
    const document = await (
      await this.collection()
    ).findOne({
      _id: cid.valueOf(),
    });

    return document ? this.toDomain(document) : undefined;
  }

  public async findByNetworkId(
    networkId: NetworkId,
    limit = 500,
  ): Promise<IPFSContentReplication[]> {
    const documents = await (await this.collection())
      .find({ networkIds: networkId.valueOf() })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .toArray();

    return documents.map((document) => this.toDomain(document));
  }

  public async save(content: IPFSContentReplication): Promise<void> {
    const document = this.toDocument(content);

    await (
      await this.collection()
    ).updateOne({ _id: document._id }, { $set: document }, { upsert: true });
  }
}
