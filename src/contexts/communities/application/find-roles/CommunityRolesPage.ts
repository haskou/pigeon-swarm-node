import { PrimitiveOf } from '@haskou/value-objects';

import { Community } from '../../domain/Community';
import { CommunityRole } from '../../domain/entities/membership/CommunityRole';
import { PageSlice } from '../pagination/PageSlice';

/** One page of a community's roles, ordered by role id ascending. */
export class CommunityRolesPage {
  constructor(
    private readonly community: Community,
    private readonly slice: PageSlice<PrimitiveOf<CommunityRole>>,
  ) {}

  public getCommunity(): Community {
    return this.community;
  }

  public getRoles(): PrimitiveOf<CommunityRole>[] {
    return [...this.slice.items];
  }

  /** The position to read after next: set only when the page is full. */
  public getNextPosition(): string | undefined {
    return this.slice.nextPosition;
  }
}
