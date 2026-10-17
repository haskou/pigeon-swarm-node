import { Type } from 'class-transformer';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

import { CommunityModerationLogBody } from './CommunityModerationLogBody';
import { CommunityOperationBody } from './CommunityOperationBody';

/** The public key derived from the link secret; the secret never comes here. */
export class PostCommunityInvitationBody {
  @IsInt()
  @Min(0)
  public readonly expiresAt: number;

  @IsString()
  public readonly invitationKey: string;

  @IsOptional()
  @IsString()
  public readonly invitee?: string;

  @IsInt()
  @Min(1)
  public readonly maxUses: number;

  @IsObject()
  @Type(() => CommunityModerationLogBody)
  @ValidateNested()
  public readonly moderationLog: CommunityModerationLogBody;

  @IsObject()
  @Type(() => CommunityOperationBody)
  @ValidateNested()
  public readonly operation: CommunityOperationBody;
}
