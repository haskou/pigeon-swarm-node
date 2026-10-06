import { Type } from 'class-transformer';
import { IsObject, ValidateNested } from 'class-validator';

import { CommunityModerationLogBody } from './CommunityModerationLogBody';

export class DeleteCommunityChannelMessageBody {
  @IsObject()
  public readonly mutation: Record<string, unknown>;

  @IsObject()
  @Type(() => CommunityModerationLogBody)
  @ValidateNested()
  public readonly moderationLog: CommunityModerationLogBody;
}
