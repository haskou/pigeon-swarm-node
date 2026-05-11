import { Notification } from '@app/contexts/notifications/domain/Notification';

import { MongoNotificationDocument } from '../documents/MongoNotificationDocument';

export default class MongoNotificationMapper {
  public toDocument(notification: Notification): MongoNotificationDocument {
    const primitives = notification.toPrimitives();

    return {
      _id: primitives.id,
      ...(primitives.archivedAt ? { archivedAt: primitives.archivedAt } : {}),
      createdAt: primitives.createdAt,
      payload: primitives.payload,
      recipientIdentityId: primitives.recipientIdentityId,
      state: primitives.state,
      status: primitives.status,
      type: primitives.type,
    };
  }

  public toDomain(document: MongoNotificationDocument): Notification {
    return Notification.fromPrimitives({
      archivedAt: document.archivedAt,
      createdAt: document.createdAt,
      id: document._id,
      payload: {
        conversationId: document.payload.conversationId,
        encryptedConversationKey: document.payload.encryptedConversationKey,
        inviterIdentityId: document.payload.inviterIdentityId,
        keychainExternalIdentifier:
          document.payload.keychainExternalIdentifier || '',
        keyEncryptionAlgorithm: document.payload.keyEncryptionAlgorithm || '',
        recipientIdentityId: document.payload.recipientIdentityId,
        signature: document.payload.signature,
      },
      recipientIdentityId: document.recipientIdentityId,
      state: document.state,
      status: document.status,
      type: document.type,
    });
  }
}
