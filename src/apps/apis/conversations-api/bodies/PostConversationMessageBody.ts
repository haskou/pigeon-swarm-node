import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class PostConversationMessageBody {
  @IsString()
  @IsNotEmpty()
  public readonly encryptedPayload: string;

  @IsInt()
  public readonly createdAt: number;

  @IsString()
  @IsNotEmpty()
  public readonly id: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public readonly previousMessageIds?: string[];

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  public readonly replyToMessageId?: string;

  @IsString()
  @IsNotEmpty()
  public readonly signature: string;
}
