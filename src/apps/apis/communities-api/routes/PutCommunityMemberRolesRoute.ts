import { CommunityRoleId } from '@app/contexts/communities/domain/value-objects/CommunityRoleId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Put,
  Req,
  Res,
} from 'routing-controllers';

import { PutCommunityMemberRolesBody } from '../bodies/PutCommunityMemberRolesBody';
import { CommunityViewModel } from '../view-model/CommunityViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PutCommunityMemberRolesRoute extends CommunityRouteSupport {
  @Put('/:communityId/members/:identityId/roles')
  public async assignRoles(
    @Param('communityId') communityId: string,
    @Param('identityId') identityId: string,
    @Body() body: PutCommunityMemberRolesBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);

    community.assignRoles(
      actorIdentityId,
      new IdentityId(identityId),
      body.roleIds.map((roleId) => new CommunityRoleId(roleId)),
    );
    await this.repository().save(community);
    await this.eventPublisher.publish(community.pullDomainEvents());

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityViewModel(community).toResource());
  }
}
