import { IsOptional, IsString } from 'class-validator';

export class PostCommunityBanBody {
  @IsString()
  public readonly identityId: string;

  @IsOptional()
  @IsString()
  public readonly reason?: string;
}
