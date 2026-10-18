import { PageSlice } from '@app/contexts/shared/application/pagination/PageSlice';

/** One page of a community's member ids, ordered ascending. */
export class CommunityMembersPage {
  constructor(private readonly slice: PageSlice<string>) {}

  public getMemberIds(): string[] {
    return [...this.slice.items];
  }

  /** The position to read after next: set only when the page is full. */
  public getNextPosition(): string | undefined {
    return this.slice.nextPosition;
  }
}
