import CommunityChannelMessagePinsFinder from '@app/contexts/communities/application/manage-channel-message-pin/CommunityChannelMessagePinsFinder';
import { CommunityChannelMessagePinsFindMessage } from '@app/contexts/communities/application/manage-channel-message-pin/messages/CommunityChannelMessagePinsFindMessage';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, Param, Req, Res } from 'routing-controllers';

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
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const pins = await this.finder.find(
      new CommunityChannelMessagePinsFindMessage(
        actorIdentityId.valueOf(),
        communityId,
        channelId,
      ),
    );

    return response.status(HttpRouteStatusEnum.OK).send({
      channelId,
      communityId,
      pins: pins.map((details) => ({
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
