import CommunityTextChannelCreator from '@app/contexts/communities/application/create-channel/CommunityTextChannelCreator';
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

import { PostCommunityTextChannelBody } from '../bodies/PostCommunityTextChannelBody';
import { CommunityTextChannelViewModel } from '../view-model/CommunityTextChannelViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PostCommunityTextChannelRoute extends CommunityRouteSupport {
  private readonly creator = this.get<CommunityTextChannelCreator>(
    CommunityTextChannelCreator,
  );

  @Post('/:communityId/channels/text')
  public async addTextChannel(
    @Param('communityId') communityId: string,
    @Body() body: PostCommunityTextChannelBody,
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
      .send(new CommunityTextChannelViewModel(channel).toResource());
  }
}
