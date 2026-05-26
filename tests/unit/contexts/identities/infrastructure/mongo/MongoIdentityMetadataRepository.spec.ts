import { MongoIdentityMetadataDocument } from '@app/contexts/identities/infrastructure/mongo/documents/MongoIdentityMetadataDocument';
import MongoIdentityMetadataRepository from '@app/contexts/identities/infrastructure/mongo/MongoIdentityMetadataRepository';
import MongoIdentityMetadataMapper from '@app/contexts/identities/infrastructure/mongo/mappers/MongoIdentityMetadataMapper';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { Collection, FindCursor } from 'mongodb';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('MongoIdentityMetadataRepository', () => {
  let repository: MongoIdentityMetadataRepository;
  let mongo: MockProxy<MongoDB>;
  let collection: MockProxy<Collection<MongoIdentityMetadataDocument>>;
  let cursor: MockProxy<FindCursor<MongoIdentityMetadataDocument>>;
  let mapper: MongoIdentityMetadataMapper;
  let mother: IdentityMother;

  beforeEach(() => {
    mongo = mock<MongoDB>();
    collection = mock<Collection<MongoIdentityMetadataDocument>>();
    cursor = mock<FindCursor<MongoIdentityMetadataDocument>>();
    mapper = new MongoIdentityMetadataMapper();
    mother = new IdentityMother();
    repository = new MongoIdentityMetadataRepository(mongo, mapper);

    mongo.getCollection.mockResolvedValue(collection as never);
  });

  it('should save identity metadata by CID', async () => {
    const identity = mother.build();
    const cid = new IPFSId('bafyidentitycid');
    const expectedDocument = mapper.toDocument(identity, cid);

    await repository.save(identity, cid);

    expect(mongo.getCollection).toHaveBeenCalledWith('identity_metadata');
    expect(collection.updateOne).toHaveBeenCalledWith(
      { _id: expectedDocument._id },
      {
        $set: {
          cid: expectedDocument.cid,
          handle: expectedDocument.handle,
          identity: expectedDocument.identity,
          identityId: expectedDocument.identityId,
          networkIds: expectedDocument.networkIds,
          previousCid: expectedDocument.previousCid,
          receivedAt: expect.any(Number),
          version: expectedDocument.version,
        },
      },
      { upsert: true },
    );
  });

  it('should find identity metadata sorted by version', async () => {
    const identity = mother.build();
    const primitives = identity.toPrimitives();
    const documents = [
      mapper.toDocument(identity, new IPFSId('bafyidentitycid')),
    ];

    collection.find.mockReturnValue(cursor);
    cursor.sort.mockReturnValue(cursor);
    cursor.toArray.mockResolvedValue(documents);

    const result = await repository.findByIdentityId(mother.id);

    expect(collection.find).toHaveBeenCalledWith({
      identityId: primitives.id,
    });
    expect(cursor.sort).toHaveBeenCalledWith({
      version: -1,
      receivedAt: -1,
    });
    expect(result).toEqual(documents);
  });

  it('should delete identity metadata by external identifier', async () => {
    const cid = new IPFSId('bafyidentitycid');

    await repository.deleteByExternalIdentifier(cid);

    expect(collection.deleteMany).toHaveBeenCalledWith({ cid: cid.valueOf() });
  });
});
