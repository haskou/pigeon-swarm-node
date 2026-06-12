import { CommunityChannelMessageNotFoundError } from '@app/contexts/communities/domain/errors/CommunityChannelMessageNotFoundError';
import { CommunityChannelMessageWasPinnedEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageWasPinnedEvent';
import { CommunityChannelMessageWasUnpinnedEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageWasUnpinnedEvent';
import CommunityChannelMessagePinRepository from '@app/contexts/communities/domain/repositories/CommunityChannelMessagePinRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import {
  Delete,
  Get,
  JsonController,
  Param,
  Post,
  Req,
  Res,
} from 'routing-controllers';

import { CommunityChannelMessageViewModel } from '../view-model/CommunityChannelMessageViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class CommunityChannelMessagePinsRoute extends CommunityRouteSupport {
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

    community.assertCanViewTextChannel(actorIdentityId, domainChannelId);

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

  @Post('/:communityId/channels/:channelId/messages/:messageId/pin')
  public async pinMessage(
    @Param('communityId') communityId: string,
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);
    const domainCommunityId = new CommunityId(communityId);
    const domainChannelId = new CommunityChannelId(channelId);
    const domainMessageId = new CommunityChannelMessageId(messageId);

    community.assertCanManageMessages(actorIdentityId, domainChannelId);

    const message = await this.messageRepository().findById(
      domainCommunityId,
      domainChannelId,
      domainMessageId,
    );

    if (!message) {
      throw new CommunityChannelMessageNotFoundError();
    }

    await this.pinRepository.pin(
      domainCommunityId,
      domainChannelId,
      domainMessageId,
      actorIdentityId,
    );
    const communityPrimitives = community.toPrimitives();

    await this.eventPublisher.publish([
      new CommunityChannelMessageWasPinnedEvent(communityId, {
        channelId,
        communityId,
        memberIds: communityPrimitives.memberIds,
        messageId,
        networkId: communityPrimitives.networkId,
        pinnedByIdentityId: actorIdentityId.valueOf(),
      }),
    ]);

    return response.status(HttpRouteStatusEnum.OK).send({
      channelId,
      communityId,
      messageId,
      pinnedByIdentityId: actorIdentityId.valueOf(),
    });
  }

  @Delete('/:communityId/channels/:channelId/messages/:messageId/pin')
  public async unpinMessage(
    @Param('communityId') communityId: string,
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);
    const domainCommunityId = new CommunityId(communityId);
    const domainChannelId = new CommunityChannelId(channelId);
    const domainMessageId = new CommunityChannelMessageId(messageId);

    community.assertCanManageMessages(actorIdentityId, domainChannelId);
    await this.pinRepository.unpin(
      domainCommunityId,
      domainChannelId,
      domainMessageId,
    );
    const communityPrimitives = community.toPrimitives();

    await this.eventPublisher.publish([
      new CommunityChannelMessageWasUnpinnedEvent(communityId, {
        channelId,
        communityId,
        memberIds: communityPrimitives.memberIds,
        messageId,
        networkId: communityPrimitives.networkId,
        unpinnedByIdentityId: actorIdentityId.valueOf(),
      }),
    ]);

    return response.status(HttpRouteStatusEnum.OK).send({
      channelId,
      communityId,
      messageId,
    });
  }
}
