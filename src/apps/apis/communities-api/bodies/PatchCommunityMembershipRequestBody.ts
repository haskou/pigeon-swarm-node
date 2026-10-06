import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

import { CommunityModerationLogBody } from './CommunityModerationLogBody';
import { CommunityOperationBody } from './CommunityOperationBody';

export class PatchCommunityMembershipRequestBody {
  @IsIn(['accepted', 'declined'])
  public readonly status: 'accepted' | 'declined';

  @IsObject()
  public readonly mutation: Record<string, unknown>;

  @IsObject()
  @Type(() => CommunityModerationLogBody)
  @ValidateNested()
  public readonly moderationLog: CommunityModerationLogBody;

  /** Required when accepting: the signed member_joined operation. */
  @IsOptional()
  @Type(() => CommunityOperationBody)
  @ValidateNested()
  public readonly operation?: CommunityOperationBody;

  @IsInt()
  @Min(0)
  public readonly updatedAt: number;
}
