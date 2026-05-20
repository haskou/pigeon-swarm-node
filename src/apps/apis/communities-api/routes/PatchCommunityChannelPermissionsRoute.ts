import { CommunityChannelPermissions } from '@app/contexts/communities/domain/CommunityChannelPermissions';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityModerationAction } from '@app/contexts/communities/domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '@app/contexts/communities/domain/value-objects/CommunityModerationTargetType';
import { CommunityRoleId } from '@app/contexts/communities/domain/value-objects/CommunityRoleId';
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
export class CommunityChannelPermissionsRoute extends CommunityRouteSupport {
  @Patch('/:communityId/channels/:channelId/permissions')
  public async updateChannelPermissions(
    @Param('communityId') communityId: string,
    @Param('channelId') channelId: string,
    @Body() body: PatchCommunityChannelPermissionsBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);

    community.updateChannelPermissions(
      actorIdentityId,
      new CommunityChannelId(channelId),
      new CommunityChannelPermissions(
        body.visibleRoleIds.map((roleId) => new CommunityRoleId(roleId)),
      ),
    );
    await this.repository().save(community);
    await this.eventPublisher.publish(community.pullDomainEvents());
    await this.recordModerationLog(
      community,
      actorIdentityId,
      CommunityModerationAction.CHANNEL_PERMISSIONS_UPDATED,
      this.moderationTarget(
        CommunityModerationTargetType.CHANNEL,
        new CommunityChannelId(channelId),
      ),
      { visibleRoleIds: body.visibleRoleIds },
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityViewModel(community).toResource());
  }
}
