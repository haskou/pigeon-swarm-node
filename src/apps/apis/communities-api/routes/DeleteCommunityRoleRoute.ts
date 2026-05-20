import { CommunityModerationAction } from '@app/contexts/communities/domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '@app/contexts/communities/domain/value-objects/CommunityModerationTargetType';
import { CommunityRoleId } from '@app/contexts/communities/domain/value-objects/CommunityRoleId';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Delete, JsonController, Param, Req, Res } from 'routing-controllers';

import { CommunityViewModel } from '../view-model/CommunityViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class DeleteCommunityRoleRoute extends CommunityRouteSupport {
  @Delete('/:communityId/roles/:roleId')
  public async deleteRole(
    @Param('communityId') communityId: string,
    @Param('roleId') roleId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);

    community.deleteRole(actorIdentityId, new CommunityRoleId(roleId));
    await this.repository().save(community);
    await this.eventPublisher.publish(community.pullDomainEvents());
    await this.recordModerationLog(
      community,
      actorIdentityId,
      CommunityModerationAction.ROLE_DELETED,
      this.moderationTarget(
        CommunityModerationTargetType.ROLE,
        new CommunityRoleId(roleId),
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityViewModel(community).toResource());
  }
}
