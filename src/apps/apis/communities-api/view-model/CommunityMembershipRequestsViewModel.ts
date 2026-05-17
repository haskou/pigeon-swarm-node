import { CommunityMembershipRequest } from '@app/contexts/communities/domain/CommunityMembershipRequest';

import { CommunityMembershipRequestsResource } from '../resources/CommunityMembershipRequestResource';
import { CommunityMembershipRequestViewModel } from './CommunityMembershipRequestViewModel';

export class CommunityMembershipRequestsViewModel {
  constructor(private readonly requests: CommunityMembershipRequest[]) {}

  public toResource(): CommunityMembershipRequestsResource {
    return {
      requests: this.requests.map((request) =>
        new CommunityMembershipRequestViewModel(request).toResource(),
      ),
    };
  }
}
