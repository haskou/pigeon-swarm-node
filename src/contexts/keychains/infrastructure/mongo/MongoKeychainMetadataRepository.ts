import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { Sort } from 'mongodb';

import { Keychain } from '../../domain/Keychain';
import KeychainMetadataRepository from '../../domain/repositories/KeychainMetadataRepository';
import { KeychainExternalIdentifier } from '../../domain/value-objects/KeychainExternalIdentifier';
import { MongoKeychainMetadataDocument } from './documents/MongoKeychainMetadataDocument';
import MongoKeychainMetadataMapper from './mappers/MongoKeychainMetadataMapper';

// eslint-disable-next-line max-len
export default class MongoKeychainMetadataRepository extends KeychainMetadataRepository {
  private static readonly COLLECTION = 'keychain_metadata';

  constructor(
    private readonly mongo: MongoDB,
    private readonly mapper: MongoKeychainMetadataMapper,
  ) {
    super();
  }

  public async findByOwnerIdentityId(
    ownerIdentityId: IdentityId,
  ): Promise<MongoKeychainMetadataDocument[]> {
    const sortCriteria: Sort = { receivedAt: -1, version: -1 };
    const collection =
      await this.mongo.getCollection<MongoKeychainMetadataDocument>(
        MongoKeychainMetadataRepository.COLLECTION,
      );

    return collection
      .find({ ownerIdentityId: ownerIdentityId.valueOf() })
      .sort(sortCriteria)
      .toArray();
  }

  public async findAll(): Promise<MongoKeychainMetadataDocument[]> {
    const collection =
      await this.mongo.getCollection<MongoKeychainMetadataDocument>(
        MongoKeychainMetadataRepository.COLLECTION,
      );

    return collection.find().toArray();
  }

  public async save(
    keychain: Keychain,
    externalIdentifier: KeychainExternalIdentifier,
  ): Promise<void> {
    const collection =
      await this.mongo.getCollection<MongoKeychainMetadataDocument>(
        MongoKeychainMetadataRepository.COLLECTION,
      );
    const document = this.mapper.toDocument(
      keychain,
      new IPFSId(externalIdentifier.valueOf()),
    );

    await collection.updateOne(
      { _id: document._id },
      {
        $set: {
          cid: document.cid,
          keychain: document.keychain,
          ownerIdentityId: document.ownerIdentityId,
          previousCid: document.previousCid,
          receivedAt: document.receivedAt,
          version: document.version,
        },
      },
      { upsert: true },
    );
  }
}
