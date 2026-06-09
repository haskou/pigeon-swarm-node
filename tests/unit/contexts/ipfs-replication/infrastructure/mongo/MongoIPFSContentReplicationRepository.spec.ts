import { MongoIPFSContentReplicationDocument } from '@app/contexts/ipfs-replication/infrastructure/mongo/documents/MongoIPFSContentReplicationDocument';
import MongoIPFSContentReplicationRepository from '@app/contexts/ipfs-replication/infrastructure/mongo/MongoIPFSContentReplicationRepository';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import { OrbitDBReplicatedStateRegistry } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { Collection, FindCursor } from 'mongodb';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('MongoIPFSContentReplicationRepository', () => {
  let collection: MockProxy<Collection<MongoIPFSContentReplicationDocument>>;
  let cursor: MockProxy<FindCursor<MongoIPFSContentReplicationDocument>>;
  let mongo: MockProxy<MongoDB>;
  let repository: MongoIPFSContentReplicationRepository;

  const replicatedDocument: MongoIPFSContentReplicationDocument = {
    _id: 'bafybeiar4vdblgp6l3rglchiakcfe2vlyy22pjlll6xnvggjy7weal4t4i',
    contentType: 'image/png',
    context: 'ipfs_public_upload',
    createdAt: 1780000000000,
    filename: 'image.png',
    networkIds: ['ee33cc83-2cf1-40c0-968c-1aae69e38ae7'],
    ownerIdentityId: new IdentityMother().id.valueOf(),
    priority: 'normal',
    sizeBytes: 1024,
    updatedAt: 1780000001000,
  };

  beforeEach(() => {
    collection = mock<Collection<MongoIPFSContentReplicationDocument>>();
    cursor = mock<FindCursor<MongoIPFSContentReplicationDocument>>();
    mongo = mock<MongoDB>();
    repository = new MongoIPFSContentReplicationRepository(mongo);

    mongo.getCollection.mockResolvedValue(collection as never);
    OrbitDBReplicatedStateRegistry.shared().clear();
  });

  afterEach(() => {
    OrbitDBReplicatedStateRegistry.shared().clear();
  });

  function registerReplicatedContent(): void {
    OrbitDBReplicatedStateRegistry.shared().register('network-1', {
      ipfsReplication: {
        query: jest.fn().mockResolvedValue([
          {
            ...replicatedDocument,
            cid: replicatedDocument._id,
          },
        ]),
      },
    } as never);
  }

  it('should find content replication by CID from OrbitDB when Mongo has no document', async () => {
    collection.findOne.mockResolvedValue(undefined);
    registerReplicatedContent();

    const result = await repository.findByCid(
      new IPFSId(replicatedDocument._id),
    );

    expect(result?.toPrimitives()).toEqual({
      cid: replicatedDocument._id,
      contentType: replicatedDocument.contentType,
      context: replicatedDocument.context,
      createdAt: replicatedDocument.createdAt,
      filename: replicatedDocument.filename,
      networkIds: replicatedDocument.networkIds,
      ownerIdentityId: replicatedDocument.ownerIdentityId,
      priority: replicatedDocument.priority,
      sizeBytes: replicatedDocument.sizeBytes,
      updatedAt: replicatedDocument.updatedAt,
    });
  });

  it('should include replicated content in full listings', async () => {
    collection.find.mockReturnValue(cursor);
    cursor.sort.mockReturnValue(cursor);
    cursor.toArray.mockResolvedValue([]);
    registerReplicatedContent();

    const result = await repository.findAll();

    expect(result.map((content) => content.toPrimitives())).toEqual([
      expect.objectContaining({
        cid: replicatedDocument._id,
        networkIds: replicatedDocument.networkIds,
        sizeBytes: replicatedDocument.sizeBytes,
      }),
    ]);
  });
});
