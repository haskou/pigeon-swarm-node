import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class PostConversationMessageBody {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public readonly attachmentExternalIdentifiers?: string[];

  @IsString()
  @IsNotEmpty()
  public readonly encryptedPayload: string;

  @IsInt()
  public readonly createdAt: number;

  @IsString()
  @IsNotEmpty()
  public readonly id: string;

  @IsString()
  @IsNotEmpty()
  public readonly signature: string;
}
