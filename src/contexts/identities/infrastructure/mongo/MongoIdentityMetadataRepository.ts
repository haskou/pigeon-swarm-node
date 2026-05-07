import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { Sort } from 'mongodb';

import { Identity } from '../../domain/Identity';
import { MongoIdentityMetadataDocument } from './documents/MongoIdentityMetadataDocument';
import MongoIdentityMetadataMapper from './mappers/MongoIdentityMetadataMapper';

export default class MongoIdentityMetadataRepository {
  private static COLLECTION_NAME = 'identity_metadata';

  constructor(
    private readonly mongo: MongoDB,
    private readonly mapper: MongoIdentityMetadataMapper,
  ) {}

  public async findValidByIdentityId(
    identityId: IdentityId,
  ): Promise<MongoIdentityMetadataDocument[]> {
    // Version is the primary ordering; receivedAt only breaks ties.
    // eslint-disable-next-line perfectionist/sort-objects
    const sortCriteria: Sort = { version: -1, receivedAt: -1 };
    const collection =
      await this.mongo.getCollection<MongoIdentityMetadataDocument>(
        MongoIdentityMetadataRepository.COLLECTION_NAME,
      );

    return collection
      .find({
        identityId: identityId.valueOf(),
        valid: true,
      })
      .sort(sortCriteria)
      .toArray();
  }

  public async save(
    identity: Identity,
    cid: IPFSId,
    valid = true,
  ): Promise<void> {
    const collection =
      await this.mongo.getCollection<MongoIdentityMetadataDocument>(
        MongoIdentityMetadataRepository.COLLECTION_NAME,
      );
    const document = this.mapper.toDocument(identity, cid, valid);

    await collection.updateOne(
      { _id: document._id },
      {
        $set: {
          cid: document.cid,
          identityId: document.identityId,
          previousCid: document.previousCid,
          receivedAt: document.receivedAt,
          valid: document.valid,
          version: document.version,
        },
      },
      { upsert: true },
    );
  }
}
