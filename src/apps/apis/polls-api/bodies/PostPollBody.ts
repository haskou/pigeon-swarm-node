import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import { PollOptionBody } from './PollOptionBody';

export class PostPollBody {
  @IsObject()
  public readonly mutation: Record<string, unknown>;

  @IsObject()
  public readonly timelineMutation: Record<string, unknown>;

  @IsInt()
  public readonly createdAt: number;

  @IsString()
  @IsNotEmpty()
  public readonly pollId: string;

  @IsBoolean()
  public readonly allowsMultipleVotes: boolean;

  @IsString()
  @IsNotEmpty()
  public readonly channelId: string;

  @IsString()
  @IsNotEmpty()
  public readonly communityId: string;

  @IsOptional()
  @IsInt()
  public readonly expiresAt?: number;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PollOptionBody)
  public readonly options: PollOptionBody[];

  @IsString()
  @IsNotEmpty()
  public readonly question: string;

  @IsString()
  @IsIn(['community_channel'])
  public readonly scopeType: 'community_channel';
}
