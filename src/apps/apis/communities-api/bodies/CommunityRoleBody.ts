import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsObject,
  IsString,
  ValidateNested,
} from 'class-validator';

import { CommunityModerationLogBody } from './CommunityModerationLogBody';
import { CommunityOperationBody } from './CommunityOperationBody';

export class CommunityRoleBody {
  @IsString()
  public readonly name: string;

  @ArrayUnique()
  @IsArray()
  @IsString({ each: true })
  public readonly permissions: string[];

  @IsObject()
  @Type(() => CommunityModerationLogBody)
  @ValidateNested()
  public readonly moderationLog: CommunityModerationLogBody;

  @IsObject()
  @Type(() => CommunityOperationBody)
  @ValidateNested()
  public readonly operation: CommunityOperationBody;
}
