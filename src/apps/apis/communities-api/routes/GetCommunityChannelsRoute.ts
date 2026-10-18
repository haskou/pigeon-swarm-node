import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import CommunityChannelsFinder from '@app/contexts/communities/application/find-channels/CommunityChannelsFinder';
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

import { GetCommunityChannelsRequest } from '../requests/GetCommunityChannelsRequest';
import { CommunityChannelsViewModel } from '../view-model/CommunityChannelsViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class GetCommunityChannelsRoute extends CommunityRouteSupport {
  private readonly finder = this.get<CommunityChannelsFinder>(
    CommunityChannelsFinder,
  );

  @Get('/:communityId/channels')
  public async getChannels(
    @Param('communityId') communityId: string,
    @QueryParam('limit') limit: string | undefined,
    @QueryParam('cursor') cursor: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const pageRequest = new GetCommunityChannelsRequest(
      communityId,
      actorIdentityId.valueOf(),
      cursor,
      limit,
    );
    const details = await this.finder.find(pageRequest.getMessage());
    const nextPosition = details.getNextPosition();

    return response.status(HttpRouteStatusEnum.OK).send(
      new CommunityChannelsViewModel(
        details.getCommunity(),
        details.getActorIdentityId(),
        details.getConnectedIdentityIdsByChannelId(),
        details.getThreadSummariesByChannelId(),
        details.getPageChannelIds(),
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
