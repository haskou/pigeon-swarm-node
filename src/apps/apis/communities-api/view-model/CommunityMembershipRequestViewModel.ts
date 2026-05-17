import { CommunityMembershipRequest } from '@app/contexts/communities/domain/CommunityMembershipRequest';

import { CommunityMembershipRequestResource } from '../resources/CommunityMembershipRequestResource';

export class CommunityMembershipRequestViewModel {
  constructor(private readonly request: CommunityMembershipRequest) {}

  public toResource(): CommunityMembershipRequestResource {
    return this.request.toPrimitives();
  }
}
