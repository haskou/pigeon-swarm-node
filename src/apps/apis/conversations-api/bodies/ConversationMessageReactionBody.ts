import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class ConversationMessageReactionBody {
  @IsString()
  @IsNotEmpty()
  public readonly emoji: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  public readonly createdAt?: number;

  @IsObject()
  public readonly mutation: Record<string, unknown>;
}
