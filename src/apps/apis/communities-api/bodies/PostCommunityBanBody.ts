import { Type } from 'class-transformer';
import { IsOptional, IsString, ValidateNested } from 'class-validator';

import { CommunityModerationLogBody } from './CommunityModerationLogBody';
import { CommunityOperationBody } from './CommunityOperationBody';

export class PostCommunityBanBody {
  @IsString()
  public readonly identityId: string;

  @IsOptional()
  @IsString()
  public readonly reason?: string;

  @Type(() => CommunityModerationLogBody)
  @ValidateNested()
  public readonly moderationLog: CommunityModerationLogBody;

  @Type(() => CommunityOperationBody)
  @ValidateNested()
  public readonly operation: CommunityOperationBody;
}
