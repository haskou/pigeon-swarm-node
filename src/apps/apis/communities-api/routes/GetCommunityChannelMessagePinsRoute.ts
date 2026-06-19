import CommunityChannelMessagePinRepository from '@app/contexts/communities/domain/repositories/CommunityChannelMessagePinRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Get, JsonController, Param, Req, Res } from 'routing-controllers';

import { CommunityChannelMessageViewModel } from '../view-model/CommunityChannelMessageViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class GetCommunityChannelMessagePinsRoute extends CommunityRouteSupport {
  private readonly pinRepository =
    this.get<CommunityChannelMessagePinRepository>(
      CommunityChannelMessagePinRepository,
    );

  @Get('/:communityId/channels/:channelId/pins')
  public async listPins(
    @Param('communityId') communityId: string,
    @Param('channelId') channelId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);
    const domainCommunityId = new CommunityId(communityId);
    const domainChannelId = new CommunityChannelId(channelId);

    community.viewTextChannel(actorIdentityId, domainChannelId);

    const pins = await this.pinRepository.findByChannel(
      domainCommunityId,
      domainChannelId,
    );
    const resources = [];

    for (const pin of pins) {
      const message = await this.messageRepository().findById(
        domainCommunityId,
        domainChannelId,
        new CommunityChannelMessageId(pin.messageId),
      );

      if (message) {
        resources.push({
          createdAt: pin.createdAt,
          message: new CommunityChannelMessageViewModel(message).toResource(),
          messageId: pin.messageId,
          pinnedByIdentityId: pin.pinnedByIdentityId,
        });
      }
    }

    return response.status(HttpRouteStatusEnum.OK).send({
      channelId,
      communityId,
      pins: resources,
    });
  }
}
