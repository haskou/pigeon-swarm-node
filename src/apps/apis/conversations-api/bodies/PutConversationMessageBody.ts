import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class PutConversationMessageBody {
  @IsString()
  @IsNotEmpty()
  public readonly id: string;

  @IsInt()
  public readonly createdAt: number;

  @IsString()
  @IsNotEmpty()
  public readonly encryptedPayload: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public readonly previousMessageIds?: string[];

  @IsObject()
  public readonly mutation: Record<string, unknown>;
}
