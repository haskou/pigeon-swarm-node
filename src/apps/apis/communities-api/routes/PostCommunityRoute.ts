import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityAvatar } from '@app/contexts/communities/domain/value-objects/CommunityAvatar';
import { CommunityBanner } from '@app/contexts/communities/domain/value-objects/CommunityBanner';
import { CommunityDescription } from '@app/contexts/communities/domain/value-objects/CommunityDescription';
import { CommunityName } from '@app/contexts/communities/domain/value-objects/CommunityName';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
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
    const community = Community.create(
      ownerIdentityId,
      new NetworkId(body.networkId),
      new CommunityName(body.name),
      new CommunityDescription(body.description),
      body.avatar ? new CommunityAvatar(body.avatar) : undefined,
      body.banner ? new CommunityBanner(body.banner) : undefined,
    );

    await this.repository().save(community);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityViewModel(community).toResource());
  }
}
