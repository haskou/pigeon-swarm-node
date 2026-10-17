import { Type } from 'class-transformer';
import { IsObject, IsString, ValidateNested } from 'class-validator';

import { CommunityOperationBody } from './CommunityOperationBody';

/** The claim a manager admits, copied into its signed `member_joined`. */
export class PostCommunityInvitationAdmissionBody {
  @IsString()
  public readonly consent: string;

  @IsString()
  public readonly identityId: string;

  @IsString()
  public readonly possession: string;

  @IsObject()
  @Type(() => CommunityOperationBody)
  @ValidateNested()
  public readonly operation: CommunityOperationBody;
}
