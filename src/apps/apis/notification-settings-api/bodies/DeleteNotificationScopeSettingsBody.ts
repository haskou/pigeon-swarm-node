import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

import { NotificationScopeBody } from './NotificationScopeBody';

export class DeleteNotificationScopeSettingsBody {
  @Type(() => NotificationScopeBody)
  @ValidateNested()
  public readonly scope: NotificationScopeBody;
}
