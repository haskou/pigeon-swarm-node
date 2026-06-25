import CommunityLeaver from '@app/contexts/communities/application/leave-community/CommunityLeaver';
import { CommunityLeaveMessage } from '@app/contexts/communities/application/leave-community/messages/CommunityLeaveMessage';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Delete, JsonController, Param, Req, Res } from 'routing-controllers';

import { CommunityViewModel } from '../view-model/CommunityViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class DeleteCommunityMemberRoute extends CommunityRouteSupport {
  private readonly leaver = this.get<CommunityLeaver>(CommunityLeaver);

  @Delete('/:communityId/members/me')
  public async leave(
    @Param('communityId') communityId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.leaver.leave(
      new CommunityLeaveMessage(communityId, actorIdentityId.valueOf()),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityViewModel(community).toResource());
  }
}
