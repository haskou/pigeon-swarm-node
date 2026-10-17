import CommunityInvitationsFinder from '@app/contexts/communities/application/find-invitations/CommunityInvitationsFinder';
import { CommunityInvitationsFindMessage } from '@app/contexts/communities/application/find-invitations/messages/CommunityInvitationsFindMessage';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, Param, Req, Res } from 'routing-controllers';

import { CommunityInvitationsViewModel } from '../view-model/CommunityInvitationsViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class GetCommunityInvitationsRoute extends CommunityRouteSupport {
  private readonly finder = this.get<CommunityInvitationsFinder>(
    CommunityInvitationsFinder,
  );

  @Get('/:communityId/invitations')
  public async getInvitations(
    @Param('communityId') communityId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const { community, invitations } = await this.finder.find(
      new CommunityInvitationsFindMessage(communityId, identityId.valueOf()),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new CommunityInvitationsViewModel(community, invitations).toResource(),
      );
  }
}
