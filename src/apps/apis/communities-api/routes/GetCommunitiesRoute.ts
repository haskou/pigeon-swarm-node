import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import CommunitiesFinder from '@app/contexts/communities/application/find-communities/CommunitiesFinder';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, QueryParam, Req, Res } from 'routing-controllers';

import { GetCommunitiesRequest } from '../requests/GetCommunitiesRequest';
import { CommunitiesViewModel } from '../view-model/CommunitiesViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class GetCommunitiesRoute extends CommunityRouteSupport {
  private readonly finder = this.get<CommunitiesFinder>(CommunitiesFinder);

  @Get()
  public async getCommunities(
    @QueryParam('limit') limit: string | undefined,
    @QueryParam('cursor') cursor: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const pageRequest = new GetCommunitiesRequest(
      identityId.valueOf(),
      cursor,
      limit,
    );
    const page = await this.finder.find(pageRequest.getMessage());
    const nextPosition = page.getNextPosition();

    return response.status(HttpRouteStatusEnum.OK).send(
      new CommunitiesViewModel(
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
