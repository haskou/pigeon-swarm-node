import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityModerationAction } from '@app/contexts/communities/domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '@app/contexts/communities/domain/value-objects/CommunityModerationTargetType';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Delete, JsonController, Param, Req, Res } from 'routing-controllers';

import { CommunityViewModel } from '../view-model/CommunityViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class DeleteCommunityChannelRoute extends CommunityRouteSupport {
  @Delete('/:communityId/channels/:channelId')
  public async deleteChannel(
    @Param('communityId') communityId: string,
    @Param('channelId') channelId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);
    const channelType = community.deleteChannel(
      actorIdentityId,
      new CommunityChannelId(channelId),
    );

    await this.repository().save(community);
    await this.eventPublisher.publish(community.pullDomainEvents());
    await this.recordModerationLog(
      community,
      actorIdentityId,
      CommunityModerationAction.CHANNEL_DELETED,
      this.moderationTarget(
        CommunityModerationTargetType.CHANNEL,
        new CommunityChannelId(channelId),
      ),
      { type: channelType },
    );

    if (channelType === 'text') {
      await this.messageRepository().deleteByChannel(
        new CommunityId(communityId),
        new CommunityChannelId(channelId),
      );
      await this.reactions().deleteByChannel(
        new CommunityId(communityId),
        new CommunityChannelId(channelId),
      );
    }

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityViewModel(community).toResource());
  }
}
