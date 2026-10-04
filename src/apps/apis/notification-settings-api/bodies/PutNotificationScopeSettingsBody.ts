import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

import { NotificationScopeBody } from './NotificationScopeBody';

const notificationLevels = ['all', 'mentions', 'none'];

export class PutNotificationScopeSettingsBody {
  @IsOptional()
  @IsBoolean()
  public readonly hideMutedChannels?: boolean;

  @IsOptional()
  @IsBoolean()
  public readonly mobilePushEnabled?: boolean;

  @IsOptional()
  @IsInt()
  public readonly mutedUntil?: number | null;

  @IsObject()
  public readonly mutation: Record<string, unknown>;

  @IsIn(notificationLevels)
  public readonly notificationLevel: string;

  @Type(() => NotificationScopeBody)
  @ValidateNested()
  public readonly scope: NotificationScopeBody;

  @IsOptional()
  @IsBoolean()
  public readonly suppressEveryoneAndHere?: boolean;

  @IsOptional()
  @IsBoolean()
  public readonly suppressRoleMentions?: boolean;

  @IsInt()
  @Min(0)
  public readonly updatedAt: number;
}
