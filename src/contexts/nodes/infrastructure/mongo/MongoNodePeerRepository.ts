import { NodePeer } from '@app/contexts/nodes/domain/NodePeer';
import { NodePeerRepository } from '@app/contexts/nodes/domain/repositories/NodePeerRepository';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import { MongoNodePeerDocument } from './documents/MongoNodePeerDocument';

export default class MongoNodePeerRepository implements NodePeerRepository {
  private static readonly COLLECTION_NAME = 'node_peers';

  constructor(private readonly mongo: MongoDB) {}

  private async collection() {
    return this.mongo.getCollection<MongoNodePeerDocument>(
      MongoNodePeerRepository.COLLECTION_NAME,
    );
  }

  private toDocument(peer: NodePeer): MongoNodePeerDocument {
    const primitives = peer.toPrimitives();

    return {
      _id: primitives.id,
      capabilities: primitives.capabilities,
      lastSeenAt: primitives.lastSeenAt,
      networks: primitives.networks,
      owner: primitives.owner,
    };
  }

  private toDomain(document: MongoNodePeerDocument): NodePeer {
    return NodePeer.fromPrimitives({
      capabilities: document.capabilities,
      id: document._id,
      lastSeenAt: document.lastSeenAt,
      networks: document.networks,
      owner: document.owner,
    });
  }

  public async findActive(since: Date): Promise<NodePeer[]> {
    const documents = await (
      await this.collection()
    )
      .find({ lastSeenAt: { $gte: since.getTime() } })
      .sort({ lastSeenAt: -1 })
      .toArray();

    return documents.map((document) => this.toDomain(document));
  }

  public async save(peer: NodePeer): Promise<void> {
    const document = this.toDocument(peer);

    await (
      await this.collection()
    ).updateOne({ _id: document._id }, { $set: document }, { upsert: true });
  }
}
