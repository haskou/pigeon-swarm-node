import { CommunityInvite } from '../CommunityInvite';
import { CommunityInviteToken } from '../value-objects/CommunityInviteToken';

export interface CommunityInviteRepository {
  findByToken(
    token: CommunityInviteToken,
  ): Promise<CommunityInvite | undefined>;
  save(invite: CommunityInvite): Promise<void>;
}
