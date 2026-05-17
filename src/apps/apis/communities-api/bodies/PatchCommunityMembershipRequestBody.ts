import { IsIn } from 'class-validator';

export class PatchCommunityMembershipRequestBody {
  @IsIn(['accepted', 'declined'])
  public readonly status: 'accepted' | 'declined';
}
