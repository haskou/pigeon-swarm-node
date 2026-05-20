import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class PostPollVoteBody {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  public readonly optionIds: string[];
}
