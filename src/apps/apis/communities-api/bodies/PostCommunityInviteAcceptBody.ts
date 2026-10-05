import { Type } from 'class-transformer';
import { IsInt, IsObject, Min, ValidateNested } from 'class-validator';

import { CommunityOperationBody } from './CommunityOperationBody';

export class PostCommunityInviteAcceptBody {
  @IsObject()
  public readonly mutation: Record<string, unknown>;

  @Type(() => CommunityOperationBody)
  @ValidateNested()
  public readonly operation: CommunityOperationBody;

  @IsInt()
  @Min(0)
  public readonly usedAt: number;
}
