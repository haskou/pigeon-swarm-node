import { PageSlice } from '@app/contexts/shared/application/pagination/PageSlice';

import { CommunityInvitationClaim } from '../../domain/entities/invitations/CommunityInvitationClaim';

/** One page of pending invitation claims, ordered by claim id ascending. */
export class CommunityInvitationClaimsPage {
  constructor(private readonly slice: PageSlice<CommunityInvitationClaim>) {}

  public getClaims(): CommunityInvitationClaim[] {
    return [...this.slice.items];
  }

  /** The position to read after next: set only when the page is full. */
  public getNextPosition(): string | undefined {
    return this.slice.nextPosition;
  }
}
