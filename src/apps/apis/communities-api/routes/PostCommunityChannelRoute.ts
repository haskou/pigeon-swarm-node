import CommunityTextChannelCreator from '@app/contexts/communities/application/create-channel/CommunityTextChannelCreator';
import CommunityVoiceChannelCreator from '@app/contexts/communities/application/create-channel/CommunityVoiceChannelCreator';
import { CommunityChannelCreateMessage } from '@app/contexts/communities/application/create-channel/messages/CommunityChannelCreateMessage';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Post,
  Req,
  Res,
} from 'routing-controllers';

import { PostCommunityChannelBody } from '../bodies/PostCommunityChannelBody';
import { CommunityTextChannelViewModel } from '../view-model/CommunityTextChannelViewModel';
import { CommunityVoiceChannelViewModel } from '../view-model/CommunityVoiceChannelViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PostCommunityChannelRoute extends CommunityRouteSupport {
  private readonly textCreator = this.get<CommunityTextChannelCreator>(
    CommunityTextChannelCreator,
  );

  private readonly voiceCreator = this.get<CommunityVoiceChannelCreator>(
    CommunityVoiceChannelCreator,
  );

  @Post('/:communityId/channels')
  public async addChannel(
    @Param('communityId') communityId: string,
    @Body() body: PostCommunityChannelBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const message = new CommunityChannelCreateMessage(
      communityId,
      actorIdentityId.valueOf(),
      body.name,
      body.moderationLog,
      body.operation,
    );

    if (body.type === 'voice') {
      const channel = await this.voiceCreator.create(message);

      return response
        .status(HttpRouteStatusEnum.OK)
        .send(new CommunityVoiceChannelViewModel(channel).toResource());
    }

    const channel = await this.textCreator.create(message);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityTextChannelViewModel(channel).toResource());
  }
}
