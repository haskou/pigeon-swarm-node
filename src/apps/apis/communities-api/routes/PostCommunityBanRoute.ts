import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
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
  @Post('/:communityId/bans')
  public async banMember(
    @Param('communityId') communityId: string,
    @Body() body: PostCommunityBanBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);

    community.banMember(actorIdentityId, new IdentityId(body.identityId));
    await this.repository().save(community);
    await this.eventPublisher.publish(community.pullDomainEvents());

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityViewModel(community).toResource());
  }
}
