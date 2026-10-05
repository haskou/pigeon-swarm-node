import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

import { CommunityOperationBody } from './CommunityOperationBody';

export class DeleteCommunityMemberBody {
  @Type(() => CommunityOperationBody)
  @ValidateNested()
  public readonly operation: CommunityOperationBody;
}
