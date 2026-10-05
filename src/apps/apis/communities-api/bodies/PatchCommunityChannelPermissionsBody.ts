import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsString,
  ValidateNested,
} from 'class-validator';

import { CommunityModerationLogBody } from './CommunityModerationLogBody';
import { CommunityOperationBody } from './CommunityOperationBody';

export class PatchCommunityChannelPermissionsBody {
  @ArrayUnique()
  @IsArray()
  @IsString({ each: true })
  public readonly visibleRoleIds: string[];

  @Type(() => CommunityModerationLogBody)
  @ValidateNested()
  public readonly moderationLog: CommunityModerationLogBody;

  @Type(() => CommunityOperationBody)
  @ValidateNested()
  public readonly operation: CommunityOperationBody;
}
