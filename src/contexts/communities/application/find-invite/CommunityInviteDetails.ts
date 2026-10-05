import { Community } from '../../domain/Community';
import { CommunityInvite } from '../../domain/entities/invites/CommunityInvite';

export class CommunityInviteDetails {
  constructor(
    private readonly invite: CommunityInvite,
    private readonly community: Community,
    private readonly uses: number,
  ) {}

  public getCommunity(): Community {
    return this.community;
  }

  public getUses(): number {
    return this.uses;
  }

  public getInvite(): CommunityInvite {
    return this.invite;
  }
}
