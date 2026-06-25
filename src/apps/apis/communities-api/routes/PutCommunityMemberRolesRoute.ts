import CommunityMemberRolesAssigner from '@app/contexts/communities/application/assign-member-roles/CommunityMemberRolesAssigner';
import { CommunityMemberRolesAssignMessage } from '@app/contexts/communities/application/assign-member-roles/messages/CommunityMemberRolesAssignMessage';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
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
  private readonly assigner = this.get<CommunityMemberRolesAssigner>(
    CommunityMemberRolesAssigner,
  );

  @Put('/:communityId/members/:identityId/roles')
  public async assignRoles(
    @Param('communityId') communityId: string,
    @Param('identityId') identityId: string,
    @Body() body: PutCommunityMemberRolesBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.assigner.assign(
      new CommunityMemberRolesAssignMessage(
        communityId,
        actorIdentityId.valueOf(),
        identityId,
        body.roleIds,
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityViewModel(community).toResource());
  }
}
