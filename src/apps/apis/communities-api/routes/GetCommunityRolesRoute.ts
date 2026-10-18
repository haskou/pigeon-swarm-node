import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import CommunityRolesFinder from '@app/contexts/communities/application/find-roles/CommunityRolesFinder';
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

import { GetCommunityRolesRequest } from '../requests/GetCommunityRolesRequest';
import { CommunityRolesViewModel } from '../view-model/CommunityRolesViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class GetCommunityRolesRoute extends CommunityRouteSupport {
  private readonly finder =
    this.get<CommunityRolesFinder>(CommunityRolesFinder);

  @Get('/:communityId/roles')
  public async getRoles(
    @Param('communityId') communityId: string,
    @QueryParam('limit') limit: string | undefined,
    @QueryParam('cursor') cursor: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const pageRequest = new GetCommunityRolesRequest(
      communityId,
      identityId.valueOf(),
      cursor,
      limit,
    );
    const page = await this.finder.find(pageRequest.getMessage());
    const nextPosition = page.getNextPosition();

    return response.status(HttpRouteStatusEnum.OK).send(
      new CommunityRolesViewModel(
        page.getCommunity(),
        page.getRoles(),
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
