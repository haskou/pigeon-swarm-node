import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { PollOptionBody } from './PollOptionBody';

export class PostPollBody {
  @IsBoolean()
  public readonly allowsMultipleVotes: boolean;

  @ValidateIf((body: PostPollBody) => body.scopeType === 'community_channel')
  @IsString()
  @IsNotEmpty()
  public readonly channelId?: string;

  @ValidateIf((body: PostPollBody) => body.scopeType === 'community_channel')
  @IsString()
  @IsNotEmpty()
  public readonly communityId?: string;

  @ValidateIf((body: PostPollBody) => body.scopeType === 'group_conversation')
  @IsString()
  @IsNotEmpty()
  public readonly conversationId?: string;

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
  @IsIn(['community_channel', 'group_conversation'])
  public readonly scopeType: 'community_channel' | 'group_conversation';
}
