import { IsInt, IsObject, IsString, Min } from 'class-validator';

export class PostCommunityMemberBody {
  @IsInt()
  @Min(0)
  public readonly createdAt: number;

  @IsString()
  public readonly identityId: string;

  @IsObject()
  public readonly mutation: Record<string, unknown>;
}
