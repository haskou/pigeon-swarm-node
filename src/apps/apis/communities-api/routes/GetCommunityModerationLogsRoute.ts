import { CommunityModerationLogId } from '@app/contexts/communities/domain/value-objects/CommunityModerationLogId';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
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
  @Get('/:communityId/moderation-logs')
  public async getModerationLogs(
    @Param('communityId') communityId: string,
    @QueryParam('limit') limit: number | undefined,
    @QueryParam('beforeLogId') beforeLogId: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);

    community.assertCanViewModerationLog(actorIdentityId);

    const normalizedLimit = Math.min(Math.max(limit || 50, 1), 100);
    const logs = await this.moderationLogs().findByCommunity(
      community.getId(),
      normalizedLimit,
      beforeLogId ? new CommunityModerationLogId(beforeLogId) : undefined,
    );
    const resource: CommunityModerationLogsResource = {
      logs: logs.map((entry) => entry.toPrimitives()),
      nextBeforeLogId:
        logs.length === normalizedLimit
          ? logs[logs.length - 1].getId().valueOf()
          : undefined,
    };

    return response.status(HttpRouteStatusEnum.OK).send(resource);
  }
}
