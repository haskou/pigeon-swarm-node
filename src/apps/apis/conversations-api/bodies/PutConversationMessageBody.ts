import {
  IsArray,
  IsInt,
  IsNotEmpty,
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

  @IsString()
  @IsNotEmpty()
  public readonly signature: string;
}
