import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import CommunityInvitationClaimsFinder from '@app/contexts/communities/application/find-invitation-claims/CommunityInvitationClaimsFinder';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import {
  Get,
  JsonController,
  Param,
  QueryParam,
  Req,
  Res,
} from 'routing-controllers';

import { GetCommunityInvitationClaimsRequest } from '../requests/GetCommunityInvitationClaimsRequest';
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
    @QueryParam('limit') limit: string | undefined,
    @QueryParam('cursor') cursor: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const pageRequest = new GetCommunityInvitationClaimsRequest(
      communityId,
      identityId.valueOf(),
      cursor,
      limit,
    );
    const page = await this.finder.find(pageRequest.getMessage());
    const nextPosition = page.getNextPosition();

    return response.status(HttpRouteStatusEnum.OK).send(
      new CommunityInvitationClaimsViewModel(
        page.getClaims(),
        nextPosition === undefined
          ? null
          : PageCursor.encode({
              position: nextPosition,
              resource: pageRequest.scope(),
            }),
      ).toResource(),
    );
  }
}
