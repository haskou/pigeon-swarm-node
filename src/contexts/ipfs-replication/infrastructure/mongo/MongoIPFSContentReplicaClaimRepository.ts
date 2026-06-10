import { IPFSContentReplicaClaim } from '@app/contexts/ipfs-replication/domain/IPFSContentReplicaClaim';
import IPFSContentReplicaClaimRepository from '@app/contexts/ipfs-replication/domain/repositories/IPFSContentReplicaClaimRepository';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import { MongoIPFSContentReplicaClaimDocument } from './documents/MongoIPFSContentReplicaClaimDocument';

// eslint-disable-next-line max-len
export default class MongoIPFSReplicaClaimRepository extends IPFSContentReplicaClaimRepository {
  private static readonly COLLECTION = 'ipfs_content_replica_claims';

  constructor(private readonly mongo: MongoDB) {
    super();
  }

  private async collection() {
    return this.mongo.getCollection<MongoIPFSContentReplicaClaimDocument>(
      MongoIPFSReplicaClaimRepository.COLLECTION,
    );
  }

  private getId(claim: IPFSContentReplicaClaim): string {
    const primitives = claim.toPrimitives();

    return `${primitives.cid}:${primitives.networkId}:${primitives.nodeId}`;
  }

  private toDocument(
    claim: IPFSContentReplicaClaim,
  ): MongoIPFSContentReplicaClaimDocument {
    const primitives = claim.toPrimitives();

    return {
      _id: this.getId(claim),
      cid: primitives.cid,
      claimedAt: primitives.claimedAt,
      networkId: primitives.networkId,
      nodeId: primitives.nodeId,
    };
  }

  private toDomain(
    document: MongoIPFSContentReplicaClaimDocument,
  ): IPFSContentReplicaClaim {
    return IPFSContentReplicaClaim.fromPrimitives({
      cid: document.cid,
      claimedAt: document.claimedAt,
      networkId: document.networkId,
      nodeId: document.nodeId,
    });
  }

  public async findByCids(cids: IPFSId[]): Promise<IPFSContentReplicaClaim[]> {
    if (cids.length === 0) {
      return [];
    }

    const documents = await (
      await this.collection()
    )
      .find({
        cid: {
          $in: cids.map((cid) => cid.valueOf()),
        },
      })
      .toArray();

    return documents.map((document) => this.toDomain(document));
  }

  public async save(claim: IPFSContentReplicaClaim): Promise<void> {
    const document = this.toDocument(claim);

    await (
      await this.collection()
    ).updateOne({ _id: document._id }, { $set: document }, { upsert: true });
  }
}
