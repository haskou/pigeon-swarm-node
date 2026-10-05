import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsObject,
  IsString,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

import { EncryptedCommunityInviteKeyBody } from './EncryptedCommunityInviteKeyBody';

export class PostCommunityInviteBody {
  @IsInt()
  @Min(0)
  public readonly createdAt: number;

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

  @IsObject()
  public readonly mutation: Record<string, unknown>;

  @IsString()
  public readonly nonce: string;
}
