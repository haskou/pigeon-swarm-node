import CommunityCreator from '@app/contexts/communities/application/create-community/CommunityCreator';
import { CommunityCreateMessage } from '@app/contexts/communities/application/create-community/messages/CommunityCreateMessage';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Body, JsonController, Post, Req, Res } from 'routing-controllers';

import { PostCommunityBody } from '../bodies/PostCommunityBody';
import { CommunityViewModel } from '../view-model/CommunityViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PostCommunityRoute extends CommunityRouteSupport {
  private readonly creator = this.get<CommunityCreator>(CommunityCreator);

  @Post('/')
  public async createCommunity(
    @Body() body: PostCommunityBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const ownerIdentityId = await this.authenticate(request);
    const community = await this.creator.create(
      new CommunityCreateMessage(
        ownerIdentityId.valueOf(),
        body.networkId,
        body.name,
        body.description,
        body.avatar,
        body.banner,
        {
          autoJoinEnabled: body.autoJoinEnabled,
          discoverable: body.discoverable,
          visibility: body.visibility,
        },
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityViewModel(community).toResource());
  }
}
