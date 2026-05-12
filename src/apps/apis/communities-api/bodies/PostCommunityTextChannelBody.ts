import { IsString } from 'class-validator';

export class PostCommunityTextChannelBody {
  @IsString()
  public readonly name: string;
}
