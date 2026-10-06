import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import { CommunityOperationBody } from './CommunityOperationBody';

export class PostCommunityBody {
  @IsOptional()
  @IsBoolean()
  public readonly autoJoinEnabled?: boolean;

  @IsOptional()
  @IsString()
  public readonly avatar?: string;

  @IsOptional()
  @IsString()
  public readonly banner?: string;

  @IsOptional()
  @IsBoolean()
  public readonly discoverable?: boolean;

  @IsString()
  public readonly description: string;

  @IsString()
  public readonly name: string;

  @IsString()
  public readonly networkId: string;

  @IsString()
  public readonly nonce: string;

  @IsObject()
  @Type(() => CommunityOperationBody)
  @ValidateNested()
  public readonly operation: CommunityOperationBody;

  @IsOptional()
  @IsIn(['private', 'public'])
  public readonly visibility?: string;
}
