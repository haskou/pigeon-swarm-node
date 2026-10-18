import { CommunityInvitationResource } from './CommunityInvitationResource';

export interface CommunityInvitationsResource {
  invitations: CommunityInvitationResource[];
  nextCursor: string | null;
}
