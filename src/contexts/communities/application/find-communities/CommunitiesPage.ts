import { Community } from '../../domain/Community';
import { PageSlice } from '../pagination/PageSlice';

/** One page of the communities a member belongs to, in community id order. */
export class CommunitiesPage {
  constructor(private readonly slice: PageSlice<Community>) {}

  public getItems(): Community[] {
    return [...this.slice.items];
  }

  /** The community id to read after next: set only when the page is full. */
  public getNextPosition(): string | undefined {
    return this.slice.nextPosition;
  }
}
