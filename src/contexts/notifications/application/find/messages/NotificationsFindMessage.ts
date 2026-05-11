import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { NotificationId } from '../../../domain/value-objects/NotificationId';

export class NotificationsFindMessage {
  public readonly beforeNotificationId: NotificationId | undefined;
  public readonly limit: number;
  public readonly recipientIdentityId: IdentityId;

  constructor(
    recipientIdentityId: string,
    limit = 20,
    beforeNotificationId?: string,
  ) {
    this.beforeNotificationId = beforeNotificationId
      ? new NotificationId(beforeNotificationId)
      : undefined;
    this.limit = limit;
    this.recipientIdentityId = new IdentityId(recipientIdentityId);
  }
}
