import CommunityMemberBanner from '@app/contexts/communities/application/ban-member/CommunityMemberBanner';
import { CommunityMemberBanMessage } from '@app/contexts/communities/application/ban-member/messages/CommunityMemberBanMessage';
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

import { PostCommunityBanBody } from '../bodies/PostCommunityBanBody';
import { CommunityViewModel } from '../view-model/CommunityViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PostCommunityBanRoute extends CommunityRouteSupport {
  private readonly banner = this.get<CommunityMemberBanner>(
    CommunityMemberBanner,
  );

  @Post('/:communityId/bans')
  public async banMember(
    @Param('communityId') communityId: string,
    @Body() body: PostCommunityBanBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.banner.ban(
      new CommunityMemberBanMessage(
        communityId,
        actorIdentityId.valueOf(),
        body.identityId,
        body.reason,
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityViewModel(community).toResource());
  }
}
