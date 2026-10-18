import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import CommunityMembersFinder from '@app/contexts/communities/application/find-members/CommunityMembersFinder';
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

import { GetCommunityMembersRequest } from '../requests/GetCommunityMembersRequest';
import { CommunityMembersViewModel } from '../view-model/CommunityMembersViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class GetCommunityMembersRoute extends CommunityRouteSupport {
  private readonly finder = this.get<CommunityMembersFinder>(
    CommunityMembersFinder,
  );

  @Get('/:communityId/members')
  public async getMembers(
    @Param('communityId') communityId: string,
    @QueryParam('limit') limit: string | undefined,
    @QueryParam('cursor') cursor: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);
    const pageRequest = new GetCommunityMembersRequest(
      communityId,
      identityId.valueOf(),
      cursor,
      limit,
    );
    const page = await this.finder.find(pageRequest.getMessage());
    const nextPosition = page.getNextPosition();

    return response.status(HttpRouteStatusEnum.OK).send(
      new CommunityMembersViewModel(
        page.getMemberIds(),
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
