import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import CommunityModerationLogsFinder from '@app/contexts/communities/application/find-moderation-logs/CommunityModerationLogsFinder';
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

import { GetCommunityModerationLogsRequest } from '../requests/GetCommunityModerationLogsRequest';
import { CommunityModerationLogsResource } from '../resources/CommunityModerationLogsResource';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class GetCommunityModerationLogsRoute extends CommunityRouteSupport {
  private readonly finder = this.get<CommunityModerationLogsFinder>(
    CommunityModerationLogsFinder,
  );

  @Get('/:communityId/moderation-logs')
  public async getModerationLogs(
    @Param('communityId') communityId: string,
    @QueryParam('limit') limit: number | undefined,
    @QueryParam('cursor') cursor: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const pageRequest = new GetCommunityModerationLogsRequest(
      communityId,
      actorIdentityId.valueOf(),
      cursor,
      limit,
    );
    const page = await this.finder.find(pageRequest.getMessage());
    const nextPosition = page.getNextPosition();
    const resource: CommunityModerationLogsResource = {
      logs: page.getLogs().map((entry) => entry.toPrimitives()),
      nextCursor:
        nextPosition === undefined
          ? null
          : PageCursor.encode({
              position: nextPosition,
              resource: pageRequest.scope(),
            }),
    };

    return response.status(HttpRouteStatusEnum.OK).send(resource);
  }
}
