import CommunityInviteDetailsFinder from '@app/contexts/communities/application/find-invite/CommunityInviteDetailsFinder';
import { CommunityInviteFindMessage } from '@app/contexts/communities/application/find-invite/messages/CommunityInviteFindMessage';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Response } from 'express';
import { Get, JsonController, Param, Res } from 'routing-controllers';

import { CommunityInviteDetailsViewModel } from '../view-model/CommunityInviteDetailsViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class GetCommunityInviteRoute extends CommunityRouteSupport {
  private readonly finder = this.get<CommunityInviteDetailsFinder>(
    CommunityInviteDetailsFinder,
  );

  @Get('/invites/:inviteToken')
  public async getInvite(
    @Param('inviteToken') inviteToken: string,
    @Res() response: Response,
  ): Promise<Response> {
    const details = await this.finder.find(
      new CommunityInviteFindMessage(inviteToken),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new CommunityInviteDetailsViewModel(
          details.getInvite(),
          details.getCommunity(),
        ).toResource(),
      );
  }
}
