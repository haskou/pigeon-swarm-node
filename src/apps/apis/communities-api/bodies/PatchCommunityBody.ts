import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import { CommunityModerationLogBody } from './CommunityModerationLogBody';

export class PatchCommunityBody {
  @IsOptional()
  @IsBoolean()
  public readonly autoJoinEnabled?: boolean;

  @IsOptional()
  @IsString()
  public readonly avatar?: string;

  @IsOptional()
  @IsString()
  public readonly banner?: string;

  @IsOptional()
  @IsBoolean()
  public readonly discoverable?: boolean;

  @IsString()
  public readonly description: string;

  @IsString()
  public readonly name: string;

  @Type(() => CommunityModerationLogBody)
  @ValidateNested()
  public readonly moderationLog: CommunityModerationLogBody;
}
