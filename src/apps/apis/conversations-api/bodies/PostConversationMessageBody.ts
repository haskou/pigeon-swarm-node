import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsObject,
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

  @IsObject()
  public readonly mutation: Record<string, unknown>;
}
