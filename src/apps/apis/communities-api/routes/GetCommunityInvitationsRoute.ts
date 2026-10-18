import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import CommunityInvitationsFinder from '@app/contexts/communities/application/find-invitations/CommunityInvitationsFinder';
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

import { GetCommunityInvitationsRequest } from '../requests/GetCommunityInvitationsRequest';
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
    @QueryParam('limit') limit: string | undefined,
    @QueryParam('cursor') cursor: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const pageRequest = new GetCommunityInvitationsRequest(
      communityId,
      identityId.valueOf(),
      cursor,
      limit,
    );
    const page = await this.finder.find(pageRequest.getMessage());
    const nextPosition = page.getNextPosition();

    return response.status(HttpRouteStatusEnum.OK).send(
      new CommunityInvitationsViewModel(
        page.getCommunity(),
        page.getInvitations(),
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
