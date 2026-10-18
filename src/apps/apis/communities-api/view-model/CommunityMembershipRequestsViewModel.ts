import { CommunityMembershipRequest } from '@app/contexts/communities/domain/entities/membership/CommunityMembershipRequest';

import { CommunityMembershipRequestsResource } from '../resources/CommunityMembershipRequestResource';
import { CommunityMembershipRequestViewModel } from './CommunityMembershipRequestViewModel';

export class CommunityMembershipRequestsViewModel {
  constructor(
    private readonly requests: CommunityMembershipRequest[],
    private readonly nextCursor: string | null,
  ) {}

  public toResource(): CommunityMembershipRequestsResource {
    return {
      nextCursor: this.nextCursor,
      requests: this.requests.map((request) =>
        new CommunityMembershipRequestViewModel(request).toResource(),
      ),
    };
  }
}
