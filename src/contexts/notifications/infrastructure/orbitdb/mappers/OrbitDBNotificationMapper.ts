import { Notification } from '@app/contexts/notifications/domain/Notification';

import { OrbitDBNotificationDocument } from '../documents/OrbitDBNotificationDocument';

export default class OrbitDBNotificationMapper {
  public toDocument(notification: Notification): OrbitDBNotificationDocument {
    const primitives = notification.toPrimitives();

    return {
      createdAt: primitives.createdAt,
      id: primitives.id,
      payload: primitives.payload,
      recipientIdentityId: primitives.recipientIdentityId,
      state: primitives.state,
      status: primitives.status,
      type: primitives.type,
    };
  }

  public toDomain(document: OrbitDBNotificationDocument): Notification {
    return Notification.fromPrimitives({
      createdAt: document.createdAt,
      id: document.id,
      payload: document.payload,
      recipientIdentityId: document.recipientIdentityId,
      state: document.state,
      status: document.status,
      type: document.type,
    });
  }
}
