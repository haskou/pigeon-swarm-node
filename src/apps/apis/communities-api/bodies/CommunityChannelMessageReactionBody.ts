import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CommunityChannelMessageReactionBody {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  public emoji!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  public createdAt?: number;

  @IsObject()
  public mutation!: Record<string, unknown>;
}
