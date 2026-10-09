import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

import { CommunityModerationLogBody } from './CommunityModerationLogBody';

export class PostCommunityInviteBody {
  @IsInt()
  @Min(0)
  public readonly createdAt: number;

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

  @IsObject()
  @Type(() => CommunityModerationLogBody)
  @ValidateNested()
  public readonly moderationLog: CommunityModerationLogBody;
}
