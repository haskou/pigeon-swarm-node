import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class PostCommunityChannelMessageBody {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public readonly attachmentExternalIdentifiers?: string[];

  @IsInt()
  public readonly createdAt: number;

  @IsString()
  @IsNotEmpty()
  public readonly encryptedPayload: string;

  @IsString()
  @IsNotEmpty()
  public readonly id: string;

  @IsString()
  @IsNotEmpty()
  public readonly signature: string;
}
