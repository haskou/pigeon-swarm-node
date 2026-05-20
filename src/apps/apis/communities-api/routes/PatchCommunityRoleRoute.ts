import { CommunityPermission } from '@app/contexts/communities/domain/value-objects/CommunityPermission';
import { CommunityRoleId } from '@app/contexts/communities/domain/value-objects/CommunityRoleId';
import { CommunityRoleName } from '@app/contexts/communities/domain/value-objects/CommunityRoleName';
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

import { CommunityRoleBody } from '../bodies/CommunityRoleBody';
import { CommunityViewModel } from '../view-model/CommunityViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PatchCommunityRoleRoute extends CommunityRouteSupport {
  @Patch('/:communityId/roles/:roleId')
  public async updateRole(
    @Param('communityId') communityId: string,
    @Param('roleId') roleId: string,
    @Body() body: CommunityRoleBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);

    community.updateRole(
      actorIdentityId,
      new CommunityRoleId(roleId),
      new CommunityRoleName(body.name),
      body.permissions.map((permission) => new CommunityPermission(permission)),
    );
    await this.repository().save(community);
    await this.eventPublisher.publish(community.pullDomainEvents());

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityViewModel(community).toResource());
  }
}
