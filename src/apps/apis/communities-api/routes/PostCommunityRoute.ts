import { CommunityCreator } from '@app/contexts/communities/application/create-community/CommunityCreator';
import { CommunityCreateMessage } from '@app/contexts/communities/application/create-community/messages/CommunityCreateMessage';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Body, JsonController, Post, Req, Res } from 'routing-controllers';

import { PostCommunityBody } from '../bodies/PostCommunityBody';
import { CommunityViewModel } from '../view-model/CommunityViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PostCommunityRoute extends CommunityRouteSupport {
  @Post('/')
  public async createCommunity(
    @Body() body: PostCommunityBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const ownerIdentityId = await this.authenticate(request);
    const community = await new CommunityCreator(this.repository()).create(
      new CommunityCreateMessage(
        ownerIdentityId.valueOf(),
        body.networkId,
        body.name,
        body.description,
        body.avatar,
        body.banner,
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityViewModel(community).toResource());
  }
}
