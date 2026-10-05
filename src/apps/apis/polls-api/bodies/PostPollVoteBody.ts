import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsObject,
  IsString,
} from 'class-validator';

export class PostPollVoteBody {
  @IsInt()
  public readonly createdAt: number;

  @IsObject()
  public readonly mutation: Record<string, unknown>;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  public readonly optionIds: string[];
}
