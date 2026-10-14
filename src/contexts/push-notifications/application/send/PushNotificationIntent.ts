import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { PushNotificationPayload } from './PushNotificationPayload';
import { PushNotificationScope } from './PushNotificationScope';

export class PushNotificationIntent {
  public readonly mentionsEveryoneOrHere!: boolean;
  public readonly mentionsRecipientIdentityIds!: IdentityId[];
  public readonly mentionsRoleIdentityIds!: IdentityId[];
  public readonly payload!: PushNotificationPayload;
  public readonly recipientIdentityIds!: IdentityId[];
  public readonly respectBusy!: boolean;
  public readonly respectPreferences!: boolean;
  public readonly scope!: PushNotificationScope;
}
