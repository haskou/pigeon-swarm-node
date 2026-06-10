import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { Sort } from 'mongodb';

import { Identity } from '../../domain/Identity';
import IdentityMetadataRepository from '../../domain/repositories/IdentityMetadataRepository';
import { IdentityExternalIdentifier } from '../../domain/value-objects/IdentityExternalIdentifier';
import { ProfileHandle } from '../../domain/value-objects/ProfileHandle';
import { MongoIdentityMetadataDocument } from './documents/MongoIdentityMetadataDocument';
import MongoIdentityMetadataMapper from './mappers/MongoIdentityMetadataMapper';

// eslint-disable-next-line max-len
export default class MongoIdentityMetadataRepository extends IdentityMetadataRepository {
  private static COLLECTION_NAME = 'identity_metadata';

  constructor(
    private readonly mongo: MongoDB,
    private readonly mapper: MongoIdentityMetadataMapper,
  ) {
    super();
  }

  public async findByIdentityId(
    identityId: IdentityId,
  ): Promise<MongoIdentityMetadataDocument[]> {
    // Version is the primary ordering; receivedAt only breaks ties.
    // eslint-disable-next-line perfectionist/sort-objects
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
      })
      .sort(sortCriteria)
      .toArray();
  }

  public async findByHandle(
    handle: ProfileHandle,
  ): Promise<MongoIdentityMetadataDocument[]> {
    const sortCriteria: Sort = { receivedAt: -1, version: -1 };
    const collection =
      await this.mongo.getCollection<MongoIdentityMetadataDocument>(
        MongoIdentityMetadataRepository.COLLECTION_NAME,
      );

    return collection
      .find({
        handle: handle.valueOf(),
      })
      .sort(sortCriteria)
      .toArray();
  }

  public async findAll(): Promise<MongoIdentityMetadataDocument[]> {
    const collection =
      await this.mongo.getCollection<MongoIdentityMetadataDocument>(
        MongoIdentityMetadataRepository.COLLECTION_NAME,
      );

    return collection.find().toArray();
  }

  public async findLatestByNetworkId(
    networkId: NetworkId,
  ): Promise<MongoIdentityMetadataDocument[]> {
    const sortCriteria: Sort = [
      ['version', -1],
      ['receivedAt', -1],
    ];
    const collection =
      await this.mongo.getCollection<MongoIdentityMetadataDocument>(
        MongoIdentityMetadataRepository.COLLECTION_NAME,
      );
    const documents = await collection
      .find({
        networkIds: networkId.valueOf(),
      })
      .sort(sortCriteria)
      .toArray();
    const latestDocuments = new Map<string, MongoIdentityMetadataDocument>();

    for (const document of documents) {
      if (!latestDocuments.has(document.identityId)) {
        latestDocuments.set(document.identityId, document);
      }
    }

    return [...latestDocuments.values()];
  }

  public async save(
    identity: Identity,
    externalIdentifier: IdentityExternalIdentifier,
  ): Promise<void> {
    const collection =
      await this.mongo.getCollection<MongoIdentityMetadataDocument>(
        MongoIdentityMetadataRepository.COLLECTION_NAME,
      );
    const document = this.mapper.toDocument(
      identity,
      new IPFSId(externalIdentifier.valueOf()),
    );

    await collection.updateOne(
      { _id: document._id },
      {
        $set: {
          cid: document.cid,
          handle: document.handle,
          identity: document.identity,
          identityId: document.identityId,
          networkIds: document.networkIds,
          previousCid: document.previousCid,
          receivedAt: document.receivedAt,
          version: document.version,
        },
      },
      { upsert: true },
    );
  }

  public async deleteByExternalIdentifier(
    externalIdentifier: IdentityExternalIdentifier,
  ): Promise<void> {
    const collection =
      await this.mongo.getCollection<MongoIdentityMetadataDocument>(
        MongoIdentityMetadataRepository.COLLECTION_NAME,
      );

    await collection.deleteMany({ cid: externalIdentifier.valueOf() });
  }
}
