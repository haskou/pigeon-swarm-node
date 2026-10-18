import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityRole } from '@app/contexts/communities/domain/entities/membership/CommunityRole';
import { PrimitiveOf } from '@haskou/value-objects';

import { CommunityRolesResource } from '../resources/CommunityRolesResource';

export class CommunityRolesViewModel {
  constructor(
    private readonly community: Community,
    private readonly roles: PrimitiveOf<CommunityRole>[],
    private readonly nextCursor: string | null,
  ) {}

  /** Member roles are returned in full: only the role list is paged. */
  public toResource(): CommunityRolesResource {
    return {
      memberRoles: this.community.toPrimitives().memberRoles,
      nextCursor: this.nextCursor,
      roles: this.roles,
    };
  }
}
