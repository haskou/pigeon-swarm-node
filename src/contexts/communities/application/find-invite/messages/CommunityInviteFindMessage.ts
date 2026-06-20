import { CommunityInviteToken } from '../../../domain/value-objects/CommunityInviteToken';

export class CommunityInviteFindMessage {
  public readonly inviteToken: CommunityInviteToken;

  constructor(inviteToken: string) {
    this.inviteToken = new CommunityInviteToken(inviteToken);
  }
}
