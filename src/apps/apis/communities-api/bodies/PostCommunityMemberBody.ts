import { IsString } from 'class-validator';

export class PostCommunityMemberBody {
  @IsString()
  public readonly identityId: string;
}
