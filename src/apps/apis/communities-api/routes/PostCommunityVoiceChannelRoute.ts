import { CommunityChannelName } from '@app/contexts/communities/domain/value-objects/CommunityChannelName';
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

import { PostCommunityVoiceChannelBody } from '../bodies/PostCommunityVoiceChannelBody';
import { CommunityVoiceChannelViewModel } from '../view-model/CommunityVoiceChannelViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PostCommunityVoiceChannelRoute extends CommunityRouteSupport {
  @Post('/:communityId/channels/voice')
  public async addVoiceChannel(
    @Param('communityId') communityId: string,
    @Body() body: PostCommunityVoiceChannelBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);
    const channel = community.addVoiceChannel(
      actorIdentityId,
      new CommunityChannelName(body.name),
    );

    await this.repository().save(community);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityVoiceChannelViewModel(channel).toResource());
  }
}
