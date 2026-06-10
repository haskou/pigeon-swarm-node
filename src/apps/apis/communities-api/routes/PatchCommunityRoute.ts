import { CommunityProfileUpdater } from '@app/contexts/communities/application/update-profile/CommunityProfileUpdater';
import { CommunityProfileUpdateMessage } from '@app/contexts/communities/application/update-profile/messages/CommunityProfileUpdateMessage';
import { CommunityModerationAction } from '@app/contexts/communities/domain/value-objects/CommunityModerationAction';
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
  private readonly updater = this.get<CommunityProfileUpdater>(
    CommunityProfileUpdater,
  );

  @Patch('/:communityId')
  public async patchCommunity(
    @Param('communityId') communityId: string,
    @Body() body: PatchCommunityBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);

    await this.updater.update(
      community,
      new CommunityProfileUpdateMessage(
        actorIdentityId.valueOf(),
        body.name,
        body.description,
        body.avatar,
        body.banner,
        body.discoverable,
        body.autoJoinEnabled,
      ),
    );
    await this.recordModerationLog(
      community,
      actorIdentityId,
      CommunityModerationAction.COMMUNITY_UPDATED,
      this.communityTarget(community),
      {
        autoJoinEnabled: body.autoJoinEnabled,
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
