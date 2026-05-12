import { Notification } from '@app/contexts/notifications/domain/Notification';

import { MongoNotificationDocument } from '../documents/MongoNotificationDocument';

export default class MongoNotificationMapper {
  public toDocument(notification: Notification): MongoNotificationDocument {
    const primitives = notification.toPrimitives();

    return {
      _id: primitives.id,
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
      createdAt: document.createdAt,
      id: document._id,
      payload: document.payload,
      recipientIdentityId: document.recipientIdentityId,
      state: document.state,
      status: document.status,
      type: document.type,
    });
  }
}
