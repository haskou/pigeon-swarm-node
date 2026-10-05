import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

import { CommunityModerationLogBody } from './CommunityModerationLogBody';
import { CommunityOperationBody } from './CommunityOperationBody';

export class DeleteCommunityBanBody {
  @Type(() => CommunityModerationLogBody)
  @ValidateNested()
  public readonly moderationLog: CommunityModerationLogBody;

  @Type(() => CommunityOperationBody)
  @ValidateNested()
  public readonly operation: CommunityOperationBody;
}
