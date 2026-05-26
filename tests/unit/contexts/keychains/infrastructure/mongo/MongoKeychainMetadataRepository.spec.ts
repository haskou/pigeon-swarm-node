import { MongoKeychainMetadataDocument } from '@app/contexts/keychains/infrastructure/mongo/documents/MongoKeychainMetadataDocument';
import MongoKeychainMetadataMapper from '@app/contexts/keychains/infrastructure/mongo/mappers/MongoKeychainMetadataMapper';
import MongoKeychainMetadataRepository from '@app/contexts/keychains/infrastructure/mongo/MongoKeychainMetadataRepository';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { Collection, FindCursor } from 'mongodb';
import { mock, MockProxy } from 'jest-mock-extended';

import { KeychainMother } from '../../../../mothers/KeychainMother';

describe('MongoKeychainMetadataRepository', () => {
  let mongo: MockProxy<MongoDB>;
  let collection: MockProxy<Collection<MongoKeychainMetadataDocument>>;
  let cursor: MockProxy<FindCursor<MongoKeychainMetadataDocument>>;
  let mapper: MongoKeychainMetadataMapper;
  let repository: MongoKeychainMetadataRepository;

  beforeEach(() => {
    mongo = mock<MongoDB>();
    collection = mock<Collection<MongoKeychainMetadataDocument>>();
    cursor = mock<FindCursor<MongoKeychainMetadataDocument>>();
    mapper = new MongoKeychainMetadataMapper();
    repository = new MongoKeychainMetadataRepository(mongo, mapper);

    mongo.getCollection.mockResolvedValue(collection as never);
  });

  it('should save keychain metadata by external identifier', async () => {
    const keychain = (await KeychainMother.create()).build();
    const cid = new IPFSId('bafy-keychain');
    const document = mapper.toDocument(keychain, cid);

    await repository.save(keychain, cid);

    expect(mongo.getCollection).toHaveBeenCalledWith('keychain_metadata');
    expect(collection.updateOne).toHaveBeenCalledWith(
      { _id: document._id },
      {
        $set: {
          cid: document.cid,
          keychain: document.keychain,
          ownerIdentityId: document.ownerIdentityId,
          previousCid: document.previousCid,
          receivedAt: expect.any(Number),
          version: document.version,
        },
      },
      { upsert: true },
    );
  });

  it('should find metadata sorted by version', async () => {
    const keychain = (await KeychainMother.create()).build();
    const document = mapper.toDocument(keychain, new IPFSId('bafy-keychain'));

    collection.find.mockReturnValue(cursor);
    cursor.sort.mockReturnValue(cursor);
    cursor.toArray.mockResolvedValue([document]);

    const result = await repository.findByOwnerIdentityId(
      (await KeychainMother.create()).ownerIdentityId,
    );

    expect(cursor.sort).toHaveBeenCalledWith({
      receivedAt: -1,
      version: -1,
    });
    expect(result).toEqual([document]);
  });
});
