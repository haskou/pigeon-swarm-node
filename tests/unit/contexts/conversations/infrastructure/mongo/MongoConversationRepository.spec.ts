import MongoConversationRepository from '@app/contexts/conversations/infrastructure/mongo/MongoConversationRepository';
import { MongoConversationDocument } from '@app/contexts/conversations/infrastructure/mongo/documents/MongoConversationDocument';
import MongoConversationMapper from '@app/contexts/conversations/infrastructure/mongo/mappers/MongoConversationMapper';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { Collection } from 'mongodb';
import { mock, MockProxy } from 'jest-mock-extended';

import { ConversationMother } from '../../../../mothers/ConversationMother';

describe('MongoConversationRepository', () => {
  let mongo: MockProxy<MongoDB>;
  let collection: MockProxy<Collection<MongoConversationDocument>>;
  let repository: MongoConversationRepository;
  let mother: ConversationMother;

  beforeEach(async () => {
    mongo = mock<MongoDB>();
    collection = mock<Collection<MongoConversationDocument>>();
    repository = new MongoConversationRepository(
      mongo,
      new MongoConversationMapper(),
    );
    mother = await ConversationMother.create();

    mongo.getCollection.mockResolvedValue(collection as never);
  });

  it('should save a one-to-one conversation metadata document', async () => {
    const conversation = mother.build();
    const primitives = conversation.toPrimitives();

    await repository.save(conversation);

    expect(mongo.getCollection).toHaveBeenCalledWith('conversations');
    expect(collection.updateOne).toHaveBeenCalledWith(
      { _id: primitives.id },
      {
        $set: {
          participantIds: primitives.participantIds,
          type: 'one-to-one',
          updatedAt: expect.any(Number),
        },
        $setOnInsert: {
          createdAt: expect.any(Number),
        },
      },
      { upsert: true },
    );
  });

  it('should find a one-to-one conversation by deterministic participant id', async () => {
    const conversation = mother.build();
    const primitives = conversation.toPrimitives();

    collection.findOne.mockResolvedValue({
      _id: primitives.id,
      createdAt: 1,
      participantIds: primitives.participantIds,
      type: 'one-to-one',
      updatedAt: 1,
    });

    const result = await repository.findOneToOne(
      mother.recipient,
      mother.author,
    );

    expect(collection.findOne).toHaveBeenCalledWith({ _id: primitives.id });
    expect(result?.toPrimitives()).toEqual(primitives);
  });

  it('should return undefined when the conversation does not exist', async () => {
    collection.findOne.mockResolvedValue(null);

    await expect(
      repository.findOneToOne(mother.author, mother.recipient),
    ).resolves.toBeUndefined();
  });
});
