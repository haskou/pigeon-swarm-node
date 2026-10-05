import { Type } from 'class-transformer';
import { IsString, ValidateNested } from 'class-validator';

import { CommunityModerationLogBody } from './CommunityModerationLogBody';
import { CommunityOperationBody } from './CommunityOperationBody';

export class PostCommunityTextChannelBody {
  @IsString()
  public readonly name: string;

  @Type(() => CommunityModerationLogBody)
  @ValidateNested()
  public readonly moderationLog: CommunityModerationLogBody;

  @Type(() => CommunityOperationBody)
  @ValidateNested()
  public readonly operation: CommunityOperationBody;
}
