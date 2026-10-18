import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import CommunityMembershipRequestsFinder from '@app/contexts/communities/application/find-membership-requests/CommunityMembershipRequestsFinder';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, QueryParam, Req, Res } from 'routing-controllers';

import { GetCommunityMembershipRequestsRequest } from '../requests/GetCommunityMembershipRequestsRequest';
import { CommunityMembershipRequestsViewModel } from '../view-model/CommunityMembershipRequestsViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/community-membership-requests')
export class GetCommunityMembershipRequestsRoute extends CommunityRouteSupport {
  private readonly finder = this.get<CommunityMembershipRequestsFinder>(
    CommunityMembershipRequestsFinder,
  );

  @Get()
  public async getMembershipRequests(
    @QueryParam('limit') limit: string | undefined,
    @QueryParam('cursor') cursor: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const pageRequest = new GetCommunityMembershipRequestsRequest(
      identityId.valueOf(),
      cursor,
      limit,
    );
    const page = await this.finder.find(pageRequest.getMessage());
    const nextPosition = page.getNextPosition();

    return response.status(HttpRouteStatusEnum.OK).send(
      new CommunityMembershipRequestsViewModel(
        page.getItems(),
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
