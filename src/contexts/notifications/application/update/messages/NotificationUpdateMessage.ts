import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { NotificationId } from '../../../domain/value-objects/NotificationId';
import {
  NotificationState,
  NotificationStateValue,
} from '../../../domain/value-objects/NotificationState';
import {
  NotificationStatus,
  NotificationStatusValue,
} from '../../../domain/value-objects/NotificationStatus';

export class NotificationUpdateMessage {
  public readonly keychainExternalIdentifier?: string;
  public readonly notificationId: NotificationId;
  public readonly recipientIdentityId: IdentityId;
  public readonly state?: NotificationState;
  public readonly status?: NotificationStatus;
  public readonly archive?: boolean;

  constructor(
    notificationId: string,
    recipientIdentityId: string,
    status?: NotificationStatusValue,
    state?: NotificationStateValue,
    keychainExternalIdentifier?: string,
    archive?: boolean,
  ) {
    this.keychainExternalIdentifier = keychainExternalIdentifier;
    this.notificationId = new NotificationId(notificationId);
    this.recipientIdentityId = new IdentityId(recipientIdentityId);
    this.state = state ? new NotificationState(state) : undefined;
    this.status = status ? new NotificationStatus(status) : undefined;
    this.archive = archive;
  }
}
