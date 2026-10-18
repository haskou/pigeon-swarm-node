import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import CommunityChannelMessagePinsFinder from '@app/contexts/communities/application/manage-channel-message-pin/CommunityChannelMessagePinsFinder';
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

import { GetCommunityChannelMessagePinsRequest } from '../requests/GetCommunityChannelMessagePinsRequest';
import { CommunityChannelMessageViewModel } from '../view-model/CommunityChannelMessageViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class GetCommunityChannelMessagePinsRoute extends CommunityRouteSupport {
  private readonly finder = this.get<CommunityChannelMessagePinsFinder>(
    CommunityChannelMessagePinsFinder,
  );

  @Get('/:communityId/channels/:channelId/pins')
  public async listPins(
    @Param('communityId') communityId: string,
    @Param('channelId') channelId: string,
    @QueryParam('limit') limit: string | undefined,
    @QueryParam('cursor') cursor: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const pageRequest = new GetCommunityChannelMessagePinsRequest(
      communityId,
      actorIdentityId.valueOf(),
      channelId,
      cursor,
      limit,
    );
    const page = await this.finder.find(pageRequest.getMessage());
    const nextPosition = page.getNextPosition();

    return response.status(HttpRouteStatusEnum.OK).send({
      channelId,
      communityId,
      nextCursor:
        nextPosition === undefined
          ? null
          : PageCursor.encode({
              position: nextPosition,
              resource: pageRequest.scope(),
            }),
      pins: page.getItems().map((details) => ({
        createdAt: details.getPin().getCreatedAt().valueOf(),
        message: new CommunityChannelMessageViewModel(
          details.getMessage(),
        ).toResource(),
        messageId: details.getPin().getMessageId().valueOf(),
        pinnedByIdentityId: details.getPin().getPinnedByIdentityId().valueOf(),
      })),
    });
  }
}
