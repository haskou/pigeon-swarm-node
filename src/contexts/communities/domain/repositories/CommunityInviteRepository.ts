import { CommunityInvite } from '../entities/invites/CommunityInvite';
import { CommunityId } from '../value-objects/CommunityId';
import { CommunityInviteToken } from '../value-objects/CommunityInviteToken';

export default abstract class CommunityInviteRepository {
  public abstract consume(invite: CommunityInvite): Promise<CommunityInvite>;
  public abstract deleteByCommunity(communityId: CommunityId): Promise<void>;
  public abstract findByToken(
    token: CommunityInviteToken,
  ): Promise<CommunityInvite | undefined>;

  public abstract save(invite: CommunityInvite): Promise<void>;
}
