import { IsString } from 'class-validator';

export class PatchCommunityChannelBody {
  @IsString()
  public readonly name: string;
}
