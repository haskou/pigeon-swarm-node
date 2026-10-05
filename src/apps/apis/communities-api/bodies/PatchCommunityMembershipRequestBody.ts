import { Type } from 'class-transformer';
import { IsIn, IsInt, IsObject, Min, ValidateNested } from 'class-validator';

import { CommunityModerationLogBody } from './CommunityModerationLogBody';

export class PatchCommunityMembershipRequestBody {
  @IsIn(['accepted', 'declined'])
  public readonly status: 'accepted' | 'declined';

  @IsObject()
  public readonly mutation: Record<string, unknown>;

  @IsInt()
  @Min(0)
  public readonly updatedAt: number;

  @Type(() => CommunityModerationLogBody)
  @ValidateNested()
  public readonly moderationLog: CommunityModerationLogBody;
}
