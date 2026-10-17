import CommunityInvitationClaimsFinder from '@app/contexts/communities/application/find-invitation-claims/CommunityInvitationClaimsFinder';
import { CommunityInvitationClaimsFindMessage } from '@app/contexts/communities/application/find-invitation-claims/messages/CommunityInvitationClaimsFindMessage';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, Param, Req, Res } from 'routing-controllers';

import { CommunityInvitationClaimsViewModel } from '../view-model/CommunityInvitationClaimsViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class GetCommunityInvitationClaimsRoute extends CommunityRouteSupport {
  private readonly finder = this.get<CommunityInvitationClaimsFinder>(
    CommunityInvitationClaimsFinder,
  );

  @Get('/:communityId/invitation-claims')
  public async getInvitationClaims(
    @Param('communityId') communityId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const claims = await this.finder.find(
      new CommunityInvitationClaimsFindMessage(
        communityId,
        identityId.valueOf(),
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityInvitationClaimsViewModel(claims).toResource());
  }
}
