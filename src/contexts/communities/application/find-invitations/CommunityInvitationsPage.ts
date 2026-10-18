import { PageSlice } from '@app/contexts/shared/application/pagination/PageSlice';

import { Community } from '../../domain/Community';
import { CommunityInvitation } from '../../domain/entities/invitations/CommunityInvitation';

/** One page of a community's invitations, ordered by invitation id ascending. */
export class CommunityInvitationsPage {
  constructor(
    private readonly community: Community,
    private readonly slice: PageSlice<CommunityInvitation>,
  ) {}

  public getCommunity(): Community {
    return this.community;
  }

  public getInvitations(): CommunityInvitation[] {
    return [...this.slice.items];
  }

  /** The position to read after next: set only when the page is full. */
  public getNextPosition(): string | undefined {
    return this.slice.nextPosition;
  }
}
