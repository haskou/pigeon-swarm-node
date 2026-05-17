import { CommunityMembershipRequest } from '@app/contexts/communities/domain/CommunityMembershipRequest';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { JsonController, Param, Post, Req, Res } from 'routing-controllers';

import { CommunityMembershipRequestViewModel } from '../view-model/CommunityMembershipRequestViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PostCommunityJoinRequestRoute extends CommunityRouteSupport {
  @Post('/:communityId/join-requests')
  public async requestJoin(
    @Param('communityId') communityId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);
    const requests = this.membershipRequests();
    const existingRequests = await requests.findByCommunityAndIdentity(
      new CommunityId(communityId),
      actorIdentityId,
    );
    const pendingRequest = existingRequests.find((existingRequest) =>
      existingRequest.isPending(),
    );

    if (pendingRequest) {
      return response
        .status(HttpRouteStatusEnum.OK)
        .send(
          new CommunityMembershipRequestViewModel(pendingRequest).toResource(),
        );
    }

    const membershipRequest = CommunityMembershipRequest.request(
      community.getId(),
      actorIdentityId,
      community.getOwnerIdentityId(),
    );

    await requests.save(membershipRequest);
    await this.eventPublisher.publish(membershipRequest.pullDomainEvents());

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new CommunityMembershipRequestViewModel(membershipRequest).toResource(),
      );
  }
}
