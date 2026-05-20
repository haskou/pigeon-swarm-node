import { CommunityModerationAction } from '@app/contexts/communities/domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '@app/contexts/communities/domain/value-objects/CommunityModerationTargetType';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Delete, JsonController, Param, Req, Res } from 'routing-controllers';

import { CommunityViewModel } from '../view-model/CommunityViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class DeleteCommunityBanRoute extends CommunityRouteSupport {
  @Delete('/:communityId/bans/:identityId')
  public async unbanMember(
    @Param('communityId') communityId: string,
    @Param('identityId') identityId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);

    community.unbanMember(actorIdentityId, new IdentityId(identityId));
    await this.repository().save(community);
    await this.eventPublisher.publish(community.pullDomainEvents());
    await this.recordModerationLog(
      community,
      actorIdentityId,
      CommunityModerationAction.MEMBER_UNBANNED,
      this.moderationTarget(
        CommunityModerationTargetType.MEMBER,
        new IdentityId(identityId),
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityViewModel(community).toResource());
  }
}
