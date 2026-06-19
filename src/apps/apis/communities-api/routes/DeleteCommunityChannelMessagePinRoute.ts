import { CommunityChannelMessageWasUnpinnedEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageWasUnpinnedEvent';
import CommunityChannelMessagePinRepository from '@app/contexts/communities/domain/repositories/CommunityChannelMessagePinRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Delete, JsonController, Param, Req, Res } from 'routing-controllers';

import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
// eslint-disable-next-line max-len
export class DeleteCommunityChannelMessagePinRoute extends CommunityRouteSupport {
  private readonly pinRepository =
    this.get<CommunityChannelMessagePinRepository>(
      CommunityChannelMessagePinRepository,
    );

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

    community.manageChannelMessages(actorIdentityId, domainChannelId);
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
