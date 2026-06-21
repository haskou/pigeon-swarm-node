import CommunityChannelPermissionsUpdater from '@app/contexts/communities/application/update-channel-permissions/CommunityChannelPermissionsUpdater';
import { CommunityChannelPermissionsUpdateMessage } from '@app/contexts/communities/application/update-channel-permissions/messages/CommunityChannelPermissionsUpdateMessage';
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

import { PatchCommunityChannelPermissionsBody } from '../bodies/PatchCommunityChannelPermissionsBody';
import { CommunityViewModel } from '../view-model/CommunityViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
// eslint-disable-next-line max-len
export class PatchCommunityChannelPermissionsRoute extends CommunityRouteSupport {
  private readonly updater = this.get<CommunityChannelPermissionsUpdater>(
    CommunityChannelPermissionsUpdater,
  );

  @Patch('/:communityId/channels/:channelId/permissions')
  public async updateChannelPermissions(
    @Param('communityId') communityId: string,
    @Param('channelId') channelId: string,
    @Body() body: PatchCommunityChannelPermissionsBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.updater.update(
      new CommunityChannelPermissionsUpdateMessage(
        communityId,
        channelId,
        actorIdentityId.valueOf(),
        body.visibleRoleIds,
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityViewModel(community).toResource());
  }
}
