import { Type } from 'class-transformer';
import { IsObject, ValidateNested } from 'class-validator';

import { CommunityModerationLogBody } from './CommunityModerationLogBody';

export class DeleteCommunityChannelMessageBody {
  @IsObject()
  public readonly mutation: Record<string, unknown>;

  @Type(() => CommunityModerationLogBody)
  @ValidateNested()
  public readonly moderationLog: CommunityModerationLogBody;
}
