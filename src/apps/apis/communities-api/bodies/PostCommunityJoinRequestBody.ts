import { Type } from 'class-transformer';
import {
  IsInt,
  IsObject,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

import { CommunityOperationBody } from './CommunityOperationBody';

export class PostCommunityJoinRequestBody {
  @IsOptional()
  @IsObject()
  public readonly acceptedMutation?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  public readonly acceptedAt?: number;

  @IsInt()
  @Min(0)
  public readonly createdAt: number;

  @IsObject()
  public readonly mutation: Record<string, unknown>;

  @IsOptional()
  @Type(() => CommunityOperationBody)
  @ValidateNested()
  public readonly operation?: CommunityOperationBody;
}
