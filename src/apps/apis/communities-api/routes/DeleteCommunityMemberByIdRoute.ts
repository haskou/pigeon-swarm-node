import CommunityMemberKicker from '@app/contexts/communities/application/kick-member/CommunityMemberKicker';
import { CommunityMemberKickMessage } from '@app/contexts/communities/application/kick-member/messages/CommunityMemberKickMessage';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Delete, JsonController, Param, Req, Res } from 'routing-controllers';

import { CommunityViewModel } from '../view-model/CommunityViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class DeleteCommunityMemberByIdRoute extends CommunityRouteSupport {
  private readonly kicker = this.get<CommunityMemberKicker>(
    CommunityMemberKicker,
  );

  @Delete('/:communityId/members/:identityId/kick')
  public async kickMember(
    @Param('communityId') communityId: string,
    @Param('identityId') identityId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.kicker.kick(
      new CommunityMemberKickMessage(
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
