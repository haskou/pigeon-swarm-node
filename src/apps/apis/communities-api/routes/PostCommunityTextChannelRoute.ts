import { CommunityChannelName } from '@app/contexts/communities/domain/value-objects/CommunityChannelName';
import { CommunityModerationAction } from '@app/contexts/communities/domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '@app/contexts/communities/domain/value-objects/CommunityModerationTargetType';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Post,
  Req,
  Res,
} from 'routing-controllers';

import { PostCommunityTextChannelBody } from '../bodies/PostCommunityTextChannelBody';
import { CommunityTextChannelViewModel } from '../view-model/CommunityTextChannelViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PostCommunityTextChannelRoute extends CommunityRouteSupport {
  @Post('/:communityId/channels/text')
  public async addTextChannel(
    @Param('communityId') communityId: string,
    @Body() body: PostCommunityTextChannelBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);
    const channel = community.addTextChannel(
      actorIdentityId,
      new CommunityChannelName(body.name),
    );

    await this.repository().save(community);
    await this.eventPublisher.publish(community.pullDomainEvents());
    await this.recordModerationLog(
      community,
      actorIdentityId,
      CommunityModerationAction.CHANNEL_CREATED,
      this.moderationTarget(
        CommunityModerationTargetType.CHANNEL,
        channel.getId(),
      ),
      { name: body.name, type: 'text' },
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityTextChannelViewModel(channel).toResource());
  }
}
