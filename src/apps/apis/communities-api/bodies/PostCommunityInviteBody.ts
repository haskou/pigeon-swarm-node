import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

import { EncryptedCommunityInviteKeyBody } from './EncryptedCommunityInviteKeyBody';

export class PostCommunityInviteBody {
  @IsOptional()
  @ValidateNested()
  @Type(() => EncryptedCommunityInviteKeyBody)
  public readonly encryptedCommunityKey?: EncryptedCommunityInviteKeyBody;

  @IsOptional()
  @IsNumber()
  public readonly expiresAt?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  public readonly maxUses?: number;
}
