import CommunityModerationLogsFinder from '@app/contexts/communities/application/find-moderation-logs/CommunityModerationLogsFinder';
import { CommunityModerationLogsFindMessage } from '@app/contexts/communities/application/find-moderation-logs/messages/CommunityModerationLogsFindMessage';
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

import { CommunityModerationLogsResource } from '../resources/CommunityModerationLogResource';
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
    @QueryParam('beforeLogId') beforeLogId: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const page = await this.finder.find(
      new CommunityModerationLogsFindMessage(
        communityId,
        actorIdentityId.valueOf(),
        limit,
        beforeLogId,
      ),
    );
    const resource: CommunityModerationLogsResource = {
      logs: page.getLogs().map((entry) => entry.toPrimitives()),
      nextBeforeLogId: page.getNextBeforeLogId(),
    };

    return response.status(HttpRouteStatusEnum.OK).send(resource);
  }
}
