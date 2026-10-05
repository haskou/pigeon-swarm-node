import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

import { CommunityModerationLogBody } from './CommunityModerationLogBody';

export class DeleteCommunityRoleBody {
  @Type(() => CommunityModerationLogBody)
  @ValidateNested()
  public readonly moderationLog: CommunityModerationLogBody;
}
