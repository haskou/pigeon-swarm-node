import { Type } from 'class-transformer';
import { IsObject, ValidateNested } from 'class-validator';

import { NotificationScopeBody } from './NotificationScopeBody';

export class DeleteNotificationScopeSettingsBody {
  @IsObject()
  public readonly mutation: Record<string, unknown>;

  @Type(() => NotificationScopeBody)
  @ValidateNested()
  public readonly scope: NotificationScopeBody;
}
