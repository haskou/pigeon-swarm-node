import { Type } from 'class-transformer';
import { IsIn, IsObject, IsString, ValidateNested } from 'class-validator';

import { CommunityModerationLogBody } from './CommunityModerationLogBody';
import { CommunityOperationBody } from './CommunityOperationBody';

export class PostCommunityChannelBody {
  @IsString()
  public readonly name: string;

  @IsObject()
  @Type(() => CommunityModerationLogBody)
  @ValidateNested()
  public readonly moderationLog: CommunityModerationLogBody;

  @IsObject()
  @Type(() => CommunityOperationBody)
  @ValidateNested()
  public readonly operation: CommunityOperationBody;

  @IsIn(['text', 'voice'])
  public readonly type: 'text' | 'voice';
}
