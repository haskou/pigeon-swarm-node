import { CommunityRequestNotFoundError } from '@app/contexts/communities/domain/errors/CommunityRequestNotFoundError';
import { CommunityRequestId } from '@app/contexts/communities/domain/value-objects/CommunityRequestId';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Patch,
  Req,
  Res,
} from 'routing-controllers';

import { PatchCommunityMembershipRequestBody } from '../bodies/PatchCommunityMembershipRequestBody';
import { CommunityMembershipRequestViewModel } from '../view-model/CommunityMembershipRequestViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PatchCommunityRequestRoute extends CommunityRouteSupport {
  @Patch('/membership-requests/:requestId')
  public async updateMembershipRequest(
    @Param('requestId') requestId: string,
    @Body() body: PatchCommunityMembershipRequestBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const membershipRequest = await this.membershipRequests().findById(
      new CommunityRequestId(requestId),
    );

    if (!membershipRequest) {
      throw new CommunityRequestNotFoundError();
    }

    const community = await this.findCommunity(
      membershipRequest.getCommunityId().valueOf(),
    );

    if (body.status === 'accepted') {
      membershipRequest.accept(actorIdentityId, community.getOwnerIdentityId());
      community.joinWithInvite(membershipRequest.getIdentityId());
      await this.repository().save(community);
      await this.eventPublisher.publish(community.pullDomainEvents());
    } else {
      membershipRequest.decline(
        actorIdentityId,
        community.getOwnerIdentityId(),
      );
    }

    await this.membershipRequests().save(membershipRequest);
    await this.eventPublisher.publish(membershipRequest.pullDomainEvents());

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new CommunityMembershipRequestViewModel(membershipRequest).toResource(),
      );
  }
}
