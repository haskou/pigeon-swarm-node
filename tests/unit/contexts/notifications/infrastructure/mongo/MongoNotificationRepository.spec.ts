import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { OrbitDBReplicatedStateRegistry } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { Collection, FindCursor } from 'mongodb';
import { mock, MockProxy } from 'jest-mock-extended';

import { NotificationId } from '../../../../../../src/contexts/notifications/domain/value-objects/NotificationId';
import { MongoNotificationDocument } from '../../../../../../src/contexts/notifications/infrastructure/mongo/documents/MongoNotificationDocument';
import MongoNotificationMapper from '../../../../../../src/contexts/notifications/infrastructure/mongo/mappers/MongoNotificationMapper';
import MongoNotificationRepository from '../../../../../../src/contexts/notifications/infrastructure/mongo/MongoNotificationRepository';
import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('MongoNotificationRepository', () => {
  let collection: MockProxy<Collection<MongoNotificationDocument>>;
  let cursor: MockProxy<FindCursor<MongoNotificationDocument>>;
  let mongo: MockProxy<MongoDB>;
  let repository: MongoNotificationRepository;

  const identityMother = new IdentityMother();
  const identityId = identityMother.id.valueOf();
  const notificationId = '6a0df63c702bbe370bb0b8bf';
  const replicatedDocument: MongoNotificationDocument = {
    _id: notificationId,
    createdAt: 1780000000000,
    payload: {
      conversationId: 'conversation-1',
      encryptedConversationKey: 'encrypted-key',
      inviterIdentityId: identityId,
      inviterSignature: identityMother.signature.valueOf(),
      recipientIdentityId: identityId,
    },
    recipientIdentityId: identityId,
    state: 'pending',
    status: 'unread',
    type: 'conversation_invitation',
  };

  beforeEach(() => {
    collection = mock<Collection<MongoNotificationDocument>>();
    cursor = mock<FindCursor<MongoNotificationDocument>>();
    mongo = mock<MongoDB>();
    repository = new MongoNotificationRepository(
      mongo,
      new MongoNotificationMapper(),
    );

    mongo.getCollection.mockResolvedValue(collection as never);
    OrbitDBReplicatedStateRegistry.shared().clear();
  });

  afterEach(() => {
    OrbitDBReplicatedStateRegistry.shared().clear();
  });

  function registerReplicatedNotification(): void {
    OrbitDBReplicatedStateRegistry.shared().register('network-1', {
      notifications: {
        query: jest.fn().mockResolvedValue([
          {
            ...replicatedDocument,
            id: replicatedDocument._id,
          },
        ]),
      },
    } as never);
  }

  it('should find a notification by id from OrbitDB when Mongo has no document', async () => {
    collection.findOne.mockResolvedValue(undefined);
    registerReplicatedNotification();

    const result = await repository.findById(
      new NotificationId(replicatedDocument._id),
    );

    expect(result?.toPrimitives()).toEqual({
      createdAt: replicatedDocument.createdAt,
      id: replicatedDocument._id,
      payload: replicatedDocument.payload,
      recipientIdentityId: replicatedDocument.recipientIdentityId,
      state: replicatedDocument.state,
      status: replicatedDocument.status,
      type: replicatedDocument.type,
    });
  });

  it('should include replicated notifications in recipient lists', async () => {
    collection.find.mockReturnValue(cursor);
    cursor.limit.mockReturnValue(cursor);
    cursor.sort.mockReturnValue(cursor);
    cursor.toArray.mockResolvedValue([]);
    registerReplicatedNotification();

    const result = await repository.findByRecipient(
      new IdentityId(replicatedDocument.recipientIdentityId),
      10,
    );

    expect(result.map((notification) => notification.toPrimitives())).toEqual([
      {
        createdAt: replicatedDocument.createdAt,
        id: replicatedDocument._id,
        payload: replicatedDocument.payload,
        recipientIdentityId: replicatedDocument.recipientIdentityId,
        state: replicatedDocument.state,
        status: replicatedDocument.status,
        type: replicatedDocument.type,
      },
    ]);
  });
});
