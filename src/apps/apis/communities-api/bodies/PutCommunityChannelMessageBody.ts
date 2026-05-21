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
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public readonly attachmentExternalIdentifiers?: string[];

  @IsInt()
  public readonly createdAt: number;

  @IsString()
  @IsNotEmpty()
  public readonly encryptedPayload: string;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => CommunityMessageMentionBody)
  public readonly mentions?: CommunityMessageMentionBody[];

  @IsString()
  @IsNotEmpty()
  public readonly signature: string;
}
