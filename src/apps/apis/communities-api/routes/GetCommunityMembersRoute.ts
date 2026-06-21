import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Get, JsonController, Param, Req, Res } from 'routing-controllers';

import { CommunityMembersViewModel } from '../view-model/CommunityMembersViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class GetCommunityMembersRoute extends CommunityRouteSupport {
  @Get('/:communityId/members')
  public async getMembers(
    @Param('communityId') communityId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);

    community.viewAsMember(actorIdentityId);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityMembersViewModel(community).toResource());
  }
}
