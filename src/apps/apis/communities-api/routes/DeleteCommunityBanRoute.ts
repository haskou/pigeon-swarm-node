import CommunityMemberUnbanner from '@app/contexts/communities/application/ban-member/CommunityMemberUnbanner';
import { CommunityMemberUnbanMessage } from '@app/contexts/communities/application/ban-member/messages/CommunityMemberUnbanMessage';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Delete, JsonController, Param, Req, Res } from 'routing-controllers';

import { CommunityViewModel } from '../view-model/CommunityViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class DeleteCommunityBanRoute extends CommunityRouteSupport {
  private readonly unbanner = this.get<CommunityMemberUnbanner>(
    CommunityMemberUnbanner,
  );

  @Delete('/:communityId/bans/:identityId')
  public async unbanMember(
    @Param('communityId') communityId: string,
    @Param('identityId') identityId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.unbanner.unban(
      new CommunityMemberUnbanMessage(
        communityId,
        actorIdentityId.valueOf(),
        identityId,
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityViewModel(community).toResource());
  }
}
