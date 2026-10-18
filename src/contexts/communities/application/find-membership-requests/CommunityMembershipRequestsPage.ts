import { CommunityMembershipRequest } from '../../domain/entities/membership/CommunityMembershipRequest';
import { PageSlice } from '../pagination/PageSlice';

/** One page of membership requests, newest update first. */
export class CommunityMembershipRequestsPage {
  constructor(private readonly slice: PageSlice<CommunityMembershipRequest>) {}

  public getItems(): CommunityMembershipRequest[] {
    return [...this.slice.items];
  }

  /** The position to read after next: set only when the page is full. */
  public getNextPosition(): string | undefined {
    return this.slice.nextPosition;
  }
}
