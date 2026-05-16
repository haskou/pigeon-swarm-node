import { CommunityInvite } from '../CommunityInvite';
import { CommunityInviteToken } from '../value-objects/CommunityInviteToken';

export interface CommunityInviteRepository {
  consume(invite: CommunityInvite): Promise<CommunityInvite>;
  findByToken(
    token: CommunityInviteToken,
  ): Promise<CommunityInvite | undefined>;
  save(invite: CommunityInvite): Promise<void>;
}
