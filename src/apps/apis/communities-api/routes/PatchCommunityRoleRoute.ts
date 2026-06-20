import CommunityRoleUpdater from '@app/contexts/communities/application/update-role/CommunityRoleUpdater';
import { CommunityRoleUpdateMessage } from '@app/contexts/communities/application/update-role/messages/CommunityRoleUpdateMessage';
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
  private readonly updater =
    this.get<CommunityRoleUpdater>(CommunityRoleUpdater);

  @Patch('/:communityId/roles/:roleId')
  public async updateRole(
    @Param('communityId') communityId: string,
    @Param('roleId') roleId: string,
    @Body() body: CommunityRoleBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.updater.update(
      new CommunityRoleUpdateMessage(
        communityId,
        roleId,
        actorIdentityId.valueOf(),
        body.name,
        body.permissions,
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityViewModel(community).toResource());
  }
}
