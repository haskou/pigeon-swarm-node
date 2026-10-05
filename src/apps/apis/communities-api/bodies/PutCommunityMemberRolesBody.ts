import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsString, ValidateNested } from 'class-validator';

import { CommunityModerationLogBody } from './CommunityModerationLogBody';

export class PutCommunityMemberRolesBody {
  @ArrayUnique()
  @IsArray()
  @IsString({ each: true })
  public readonly roleIds: string[];

  @Type(() => CommunityModerationLogBody)
  @ValidateNested()
  public readonly moderationLog: CommunityModerationLogBody;
}
