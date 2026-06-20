import CommunityProfileUpdater from '@app/contexts/communities/application/update-profile/CommunityProfileUpdater';
import { CommunityProfileUpdateMessage } from '@app/contexts/communities/application/update-profile/messages/CommunityProfileUpdateMessage';
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
    const community = await this.updater.update(
      new CommunityProfileUpdateMessage(
        communityId,
        actorIdentityId.valueOf(),
        body.name,
        body.description,
        body.avatar,
        body.banner,
        body.discoverable,
        body.autoJoinEnabled,
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityViewModel(community).toResource());
  }
}
