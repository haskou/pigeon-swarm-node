import { CommunityAvatar } from '@app/contexts/communities/domain/value-objects/CommunityAvatar';
import { CommunityBanner } from '@app/contexts/communities/domain/value-objects/CommunityBanner';
import { CommunityDescription } from '@app/contexts/communities/domain/value-objects/CommunityDescription';
import { CommunityModerationAction } from '@app/contexts/communities/domain/value-objects/CommunityModerationAction';
import { CommunityName } from '@app/contexts/communities/domain/value-objects/CommunityName';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Patch,
  Req,
  Res,
} from 'routing-controllers';

import { PatchCommunityBody } from '../bodies/PatchCommunityBody';
import { CommunityViewModel } from '../view-model/CommunityViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PatchCommunityRoute extends CommunityRouteSupport {
  @Patch('/:communityId')
  public async patchCommunity(
    @Param('communityId') communityId: string,
    @Body() body: PatchCommunityBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);

    community.updateProfile(
      actorIdentityId,
      new CommunityName(body.name),
      new CommunityDescription(body.description),
      body.avatar ? new CommunityAvatar(body.avatar) : undefined,
      body.banner ? new CommunityBanner(body.banner) : undefined,
      body.discoverable,
    );
    await this.repository().save(community);
    await this.eventPublisher.publish(community.pullDomainEvents());
    await this.recordModerationLog(
      community,
      actorIdentityId,
      CommunityModerationAction.COMMUNITY_UPDATED,
      this.communityTarget(community),
      {
        avatar: body.avatar,
        banner: body.banner,
        description: body.description,
        discoverable: body.discoverable,
        name: body.name,
      },
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityViewModel(community).toResource());
  }
}
