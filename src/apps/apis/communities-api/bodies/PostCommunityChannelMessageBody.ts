import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import { CommunityMessageMentionBody } from './CommunityMessageMentionBody';

export class PostCommunityChannelMessageBody {
  @IsInt()
  public readonly createdAt: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  public readonly encryptedPayload?: string;

  @IsString()
  @IsNotEmpty()
  public readonly id: string;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => CommunityMessageMentionBody)
  public readonly mentions?: CommunityMessageMentionBody[];

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  public readonly plaintextPayload?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  public readonly replyToMessageId?: string;

  @IsString()
  @IsNotEmpty()
  public readonly signature: string;
}
