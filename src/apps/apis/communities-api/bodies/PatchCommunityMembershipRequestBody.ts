import { IsIn, IsInt, IsObject, Min } from 'class-validator';

export class PatchCommunityMembershipRequestBody {
  @IsIn(['accepted', 'declined'])
  public readonly status: 'accepted' | 'declined';

  @IsObject()
  public readonly mutation: Record<string, unknown>;

  @IsInt()
  @Min(0)
  public readonly updatedAt: number;
}
