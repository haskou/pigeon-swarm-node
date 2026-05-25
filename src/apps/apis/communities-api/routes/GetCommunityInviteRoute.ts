import { CommunityInviteNotFoundError } from '@app/contexts/communities/domain/errors/CommunityInviteNotFoundError';
import { CommunityInviteToken } from '@app/contexts/communities/domain/value-objects/CommunityInviteToken';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Response } from 'express';
import { Get, JsonController, Param, Res } from 'routing-controllers';

import { CommunityInviteDetailsViewModel } from '../view-model/CommunityInviteDetailsViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class GetCommunityInviteRoute extends CommunityRouteSupport {
  @Get('/invites/:inviteToken')
  public async getInvite(
    @Param('inviteToken') inviteToken: string,
    @Res() response: Response,
  ): Promise<Response> {
    const invite = await this.inviteRepository().findByToken(
      new CommunityInviteToken(inviteToken),
    );

    if (!invite) {
      throw new CommunityInviteNotFoundError();
    }

    invite.assertCanBeAccepted();

    const community = await this.findCommunity(
      invite.getCommunityId().valueOf(),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new CommunityInviteDetailsViewModel(invite, community).toResource(),
      );
  }
}
