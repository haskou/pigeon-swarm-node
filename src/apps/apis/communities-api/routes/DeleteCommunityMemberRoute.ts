import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Delete, JsonController, Param, Req, Res } from 'routing-controllers';

import { CommunityViewModel } from '../view-model/CommunityViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class DeleteCommunityMemberRoute extends CommunityRouteSupport {
  @Delete('/:communityId/members/me')
  public async leave(
    @Param('communityId') communityId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);

    community.leave(actorIdentityId);

    if (community.hasMembers()) {
      await this.repository().save(community);
    } else {
      await this.reactions().deleteByCommunity(community.getId());
      await this.messageRepository().deleteByCommunity(community.getId());
      await this.inviteRepository().deleteByCommunity(community.getId());
      await this.membershipRequests().deleteByCommunity(community.getId());
      await this.moderationLogs().deleteByCommunity(community.getId());
      await this.repository().delete(community);
    }

    await this.eventPublisher.publish(community.pullDomainEvents());

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityViewModel(community).toResource());
  }
}
