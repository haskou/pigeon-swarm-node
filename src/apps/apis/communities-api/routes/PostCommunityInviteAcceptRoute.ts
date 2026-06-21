import CommunityInviteAccepter from '@app/contexts/communities/application/accept-invite/CommunityInviteAccepter';
import { CommunityInviteAcceptMessage } from '@app/contexts/communities/application/accept-invite/messages/CommunityInviteAcceptMessage';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { JsonController, Param, Post, Req, Res } from 'routing-controllers';

import { CommunityViewModel } from '../view-model/CommunityViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PostCommunityInviteAcceptRoute extends CommunityRouteSupport {
  private readonly accepter = this.get<CommunityInviteAccepter>(
    CommunityInviteAccepter,
  );

  @Post('/invites/:inviteToken/accept')
  public async acceptInvite(
    @Param('inviteToken') inviteToken: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.accepter.accept(
      new CommunityInviteAcceptMessage(inviteToken, actorIdentityId.valueOf()),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityViewModel(community).toResource());
  }
}
