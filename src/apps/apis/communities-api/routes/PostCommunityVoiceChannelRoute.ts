import CommunityVoiceChannelCreator from '@app/contexts/communities/application/create-channel/CommunityVoiceChannelCreator';
import { CommunityChannelCreateMessage } from '@app/contexts/communities/application/create-channel/messages/CommunityChannelCreateMessage';
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
  private readonly creator = this.get<CommunityVoiceChannelCreator>(
    CommunityVoiceChannelCreator,
  );

  @Post('/:communityId/channels/voice')
  public async addVoiceChannel(
    @Param('communityId') communityId: string,
    @Body() body: PostCommunityVoiceChannelBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const channel = await this.creator.create(
      new CommunityChannelCreateMessage(
        communityId,
        actorIdentityId.valueOf(),
        body.name,
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityVoiceChannelViewModel(channel).toResource());
  }
}
