import MongoConversationRepository from '@app/contexts/conversations/infrastructure/mongo/MongoConversationRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { MongoConversationDocument } from '@app/contexts/conversations/infrastructure/mongo/documents/MongoConversationDocument';
import MongoConversationMapper from '@app/contexts/conversations/infrastructure/mongo/mappers/MongoConversationMapper';
import MongoMessageMetadataMapper from '@app/contexts/conversations/infrastructure/mongo/mappers/MongoMessageMetadataMapper';
import IpfsMessageMapper from '@app/contexts/conversations/infrastructure/ipfs/mappers/IpfsMessageMapper';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import { OrbitDBReplicatedStateRegistry } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { Collection, FindCursor } from 'mongodb';
import { mock, MockProxy } from 'jest-mock-extended';

import { ConversationMother } from '../../../../mothers/ConversationMother';

describe('MongoConversationRepository', () => {
  let collection: MockProxy<Collection<MongoConversationDocument>>;
  let cursor: MockProxy<FindCursor<MongoConversationDocument>>;
  let mongo: MockProxy<MongoDB>;
  let repository: MongoConversationRepository;

  const conversationDocument: MongoConversationDocument = {
    _id: 'one-to-one:replicated',
    createdAt: 1780000000000,
    networkId: 'ee33cc83-2cf1-40c0-968c-1aae69e38ae7',
    participantIds: [],
    type: 'one-to-one',
  };

  beforeEach(async () => {
    const mother = await ConversationMother.create();

    conversationDocument.participantIds = [
      mother.author.valueOf(),
      mother.recipient.valueOf(),
    ];
    collection = mock<Collection<MongoConversationDocument>>();
    cursor = mock<FindCursor<MongoConversationDocument>>();
    mongo = mock<MongoDB>();
    repository = new MongoConversationRepository(
      mongo,
      new MongoConversationMapper(),
      mock<IPFS>(),
      new IpfsMessageMapper(),
      new MongoMessageMetadataMapper(),
    );

    mongo.getCollection.mockResolvedValue(collection as never);
    OrbitDBReplicatedStateRegistry.shared().clear();
  });

  afterEach(() => {
    OrbitDBReplicatedStateRegistry.shared().clear();
  });

  function registerReplicatedConversation(): void {
    OrbitDBReplicatedStateRegistry.shared().register('network-1', {
      conversations: {
        query: jest.fn().mockResolvedValue([
          {
            ...conversationDocument,
            id: conversationDocument._id,
          },
        ]),
      },
    } as never);
  }

  it('should find conversation metadata by id from OrbitDB when Mongo has no document', async () => {
    collection.findOne.mockResolvedValue(undefined);
    registerReplicatedConversation();

    const result = await repository.findMetadataById(
      new ConversationId(conversationDocument._id),
    );

    expect(result?.toPrimitives()).toMatchObject({
      id: conversationDocument._id,
      networkId: conversationDocument.networkId,
      participantIds: conversationDocument.participantIds,
      type: conversationDocument.type,
    });
  });

  it('should include replicated conversations in participant lists', async () => {
    collection.findOne.mockResolvedValue(undefined);
    collection.find.mockReturnValue(cursor);
    cursor.limit.mockReturnValue(cursor);
    cursor.sort.mockReturnValue(cursor);
    cursor.toArray.mockResolvedValue([]);
    registerReplicatedConversation();

    const result = await repository.findByParticipant(
      new IdentityId(conversationDocument.participantIds[0]),
      10,
    );

    expect(result.map((conversation) => conversation.toPrimitives())).toEqual([
      expect.objectContaining({
        id: conversationDocument._id,
        networkId: conversationDocument.networkId,
        participantIds: conversationDocument.participantIds,
        type: conversationDocument.type,
      }),
    ]);
  });
});
