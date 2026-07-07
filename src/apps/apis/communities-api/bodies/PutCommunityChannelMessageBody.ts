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

export class PutCommunityChannelMessageBody {
  @IsInt()
  public readonly createdAt: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  public readonly encryptedPayload?: string;

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

  @IsString()
  @IsNotEmpty()
  public readonly signature: string;
}
