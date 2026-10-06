import { Type } from 'class-transformer';
import { IsObject, ValidateNested } from 'class-validator';

import { CommunityOperationBody } from './CommunityOperationBody';

export class DeleteCommunityMemberKickBody {
  @IsObject()
  @Type(() => CommunityOperationBody)
  @ValidateNested()
  public readonly operation: CommunityOperationBody;
}
