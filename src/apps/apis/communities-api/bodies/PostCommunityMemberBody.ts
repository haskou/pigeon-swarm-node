import { Type } from 'class-transformer';
import {
  IsInt,
  IsObject,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

import { CommunityModerationLogBody } from './CommunityModerationLogBody';

export class PostCommunityMemberBody {
  @IsInt()
  @Min(0)
  public readonly createdAt: number;

  @IsString()
  public readonly identityId: string;

  @IsObject()
  public readonly mutation: Record<string, unknown>;

  @IsObject()
  @Type(() => CommunityModerationLogBody)
  @ValidateNested()
  public readonly moderationLog: CommunityModerationLogBody;
}
