import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { NotificationId } from '../../../domain/value-objects/NotificationId';
import {
  NotificationState,
  NotificationStateValue,
} from '../../../domain/value-objects/NotificationState';

export class NotificationUpdateMessage {
  public readonly keychainExternalIdentifier?: string;
  public readonly notificationId: NotificationId;
  public readonly recipientIdentityId: IdentityId;
  public readonly state: NotificationState;

  constructor(
    notificationId: string,
    recipientIdentityId: string,
    state: NotificationStateValue,
    keychainExternalIdentifier?: string,
  ) {
    this.keychainExternalIdentifier = keychainExternalIdentifier;
    this.notificationId = new NotificationId(notificationId);
    this.recipientIdentityId = new IdentityId(recipientIdentityId);
    this.state = new NotificationState(state);
  }
}
