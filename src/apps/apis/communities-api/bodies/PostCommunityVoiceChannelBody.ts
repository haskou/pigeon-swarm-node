import { Type } from 'class-transformer';
import { IsString, ValidateNested } from 'class-validator';

import { CommunityModerationLogBody } from './CommunityModerationLogBody';

export class PostCommunityVoiceChannelBody {
  @Type(() => CommunityModerationLogBody)
  @ValidateNested()
  public readonly moderationLog: CommunityModerationLogBody;

  @IsString()
  public readonly name: string;
}
