import { Type } from 'class-transformer';
import { IsString, ValidateNested } from 'class-validator';

import { CommunityModerationLogBody } from './CommunityModerationLogBody';

export class PatchCommunityChannelBody {
  @IsString()
  public readonly name: string;

  @Type(() => CommunityModerationLogBody)
  @ValidateNested()
  public readonly moderationLog: CommunityModerationLogBody;
}
